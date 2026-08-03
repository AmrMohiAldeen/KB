import { buildHelpJuiceImport } from './helpjuiceImport'
import { openBlobStream } from './blobStream'
import { parseHelpJuiceCsvPreview } from './csv'
import { inspectZip, openZipEntryStream } from './zipPreview'
import type { HelpJuiceFileKind, HelpJuiceImportBuildResult, ParsedCsvFile } from './types'

export type ClientPackagePreview = {
  files: string[]; missingRequired: string[]; unsupported: string[]; questions?: ParsedCsvFile; answers?: ParsedCsvFile
  categories?: ParsedCsvFile; build?: HelpJuiceImportBuildResult; totalArticles: number; published: number; unpublished: number
  categoryCount: number; categoryDepth: number; missingAnswers: number; duplicateIds: number; duplicateSlugs: number
  invalidCategoryReferences: number; unresolvedMedia: number
}

const knownCsv = new Set(['questions.csv','answers.csv','categories.csv','categorizations.csv','uploads.csv','groups.csv','passes.csv','users.csv'])
const mediaExtensions = new Set(['jpg','jpeg','png','gif','webp','bmp','tif','tiff','pdf','mp4','mov','webm','avi','mpeg','mpg','docx','xlsx','pptx','odt','ods','odp','doc','xls','ppt','rtf','txt','md','json','xml'])
const previewCsvKinds = new Map<string, HelpJuiceFileKind>([
  ['questions.csv', 'questions'],
  ['answers.csv', 'answers'],
  ['categories.csv', 'categories'],
  ['categorizations.csv', 'categorizations'],
  ['uploads.csv', 'uploads']
])
const baseName = (value: string) => value.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
const field = (row: { values: Record<string,string> }, key: string) => row.values[key]?.trim() ?? ''
const boolean = (value: string) => ['true','1','yes'].includes(value.trim().toLowerCase())

export async function previewHelpJuiceFiles(selected: File[]): Promise<ClientPackagePreview> {
  const parsedFiles = new Map<string,ParsedCsvFile>(); const selectedCsvNames = new Set<string>(); let names: string[] = []
  if (selected.length === 1 && selected[0].name.toLowerCase().endsWith('.zip')) {
    const entries = await inspectZip(selected[0]); names = entries.map(entry => entry.name)
    for (const kind of ['questions.csv','answers.csv','categories.csv','categorizations.csv','uploads.csv']) {
      const matches = entries.filter(entry => baseName(entry.name) === kind)
      if (matches.length > 1) throw new Error(`The ZIP contains more than one ${kind} file.`)
      if (matches[0]) {
        selectedCsvNames.add(kind)
        parsedFiles.set(kind, await parseHelpJuiceCsvPreview(await openZipEntryStream(selected[0], matches[0]), previewCsvKinds.get(kind)!))
      }
    }
  } else {
    names = selected.map(file => file.webkitRelativePath || file.name)
    for (const file of selected) {
      const name = baseName(file.webkitRelativePath || file.name)
      if (knownCsv.has(name)) {
        if (selectedCsvNames.has(name)) throw new Error(`${name} was selected more than once.`)
        selectedCsvNames.add(name)
        const fileKind = previewCsvKinds.get(name)
        if (fileKind) parsedFiles.set(name, await parseHelpJuiceCsvPreview(openBlobStream(file), fileKind))
      }
    }
  }
  const missingRequired = ['questions.csv','answers.csv'].filter(name => !selectedCsvNames.has(name))
  const unsupported = names.filter(name => { const base = baseName(name); const extension = base.split('.').pop() ?? ''; return !knownCsv.has(base) && !mediaExtensions.has(extension) })
  const questions = parsedFiles.get('questions.csv')
  const answers = parsedFiles.get('answers.csv')
  const categories = parsedFiles.get('categories.csv')
  const build = questions && answers ? buildHelpJuiceImport({ questions, answers }) : undefined
  const answersByQuestion = new Map<string,string>()
  answers?.rows.forEach(row => { if (!answersByQuestion.has(field(row,'question_id'))) answersByQuestion.set(field(row,'question_id'), row.values.body ?? '') })
  const duplicateQuestionIds = duplicateCount(questions?.rows.map(row => field(row,'id')) ?? [])
  const duplicateAnswerIds = duplicateCount(answers?.rows.map(row => field(row,'id')) ?? [])
  const duplicateSlugs = duplicateCount(questions?.rows.map(row => field(row,'codename').toLowerCase()).filter(Boolean) ?? [])
  const categoryIds = new Set(categories?.rows.map(row => field(row,'id')) ?? []); const parent = new Map<string,string>()
  categories?.rows.forEach(row => parent.set(field(row,'id'), field(row,'parent_id')))
  let categoryDepth = 0; for (const id of categoryIds) { const seen = new Set<string>(); let current = id; let depth = 1; while (parent.get(current)) { current = parent.get(current)!; if (seen.has(current)) { depth = 0; break } seen.add(current); depth += 1 } categoryDepth = Math.max(categoryDepth, depth) }
  const mediaNames = new Set(names.filter(name => mediaExtensions.has(baseName(name).split('.').pop() ?? '')).map(baseName))
  const unresolvedMedia = answers?.rows.reduce((count,row) => count + Array.from((row.values.body ?? '').matchAll(/<(?:img|video|source)[^>]+src=["']([^"']+)["']/gi)).filter(match => { try { return !mediaNames.has(baseName(new URL(match[1], 'https://preview.invalid').pathname)) } catch { return true } }).length,0) ?? 0
  return { files:names,missingRequired,unsupported,questions,answers,categories,build,totalArticles:questions?.rows.length??0,published:questions?.rows.filter(row=>boolean(field(row,'is_published'))).length??0,unpublished:questions?.rows.filter(row=>!boolean(field(row,'is_published'))).length??0,categoryCount:categories?.rows.length??0,categoryDepth,missingAnswers:questions?.rows.filter(row=>!answersByQuestion.get(field(row,'id'))?.trim()).length??0,duplicateIds:duplicateQuestionIds+duplicateAnswerIds,duplicateSlugs,invalidCategoryReferences:questions?.rows.filter(row=>field(row,'category_id')&&!categoryIds.has(field(row,'category_id'))).length??0,unresolvedMedia }
}

const duplicateCount = (values: string[]) => { const seen=new Set<string>(); const duplicates=new Set<string>(); values.filter(Boolean).forEach(value=>{const key=value.toLowerCase();if(seen.has(key))duplicates.add(key);seen.add(key)});return duplicates.size }
