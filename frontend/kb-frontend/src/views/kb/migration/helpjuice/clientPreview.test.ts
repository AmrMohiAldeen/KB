import { describe, expect, it } from 'vitest'
import { previewHelpJuiceFiles } from './clientPreview'

describe('HelpJuice client package preview', () => {
  it('detects required files and reports missing answers clearly', async () => {
    const questions = new File(['id,name,description\nq1,"One, quoted","First line\nSecond line"'], 'questions.csv', { type: 'text/csv' })
    const preview = await previewHelpJuiceFiles([questions])
    expect(preview.missingRequired).toEqual(['answers.csv'])
    expect(preview.totalArticles).toBe(1)
    expect(preview.questions?.rows[0].values).toMatchObject({ name: 'One, quoted', description: 'First line\nSecond line' })
  })

  it('matches answers to questions and calculates publication category and validation totals', async () => {
    const files = [
      new File(['\uFEFFid,codename,name,is_published,category_id\nq1,one,One,TRUE,c1\nq2,one,Two,FALSE,missing'], 'questions.csv'),
      new File(['id,question_id,body\na1,q1,"<p>Hello, world</p>"'], 'answers.csv'),
      new File(['id,parent_id,name\nc1,,Root\nc2,c1,Child'], 'categories.csv'),
      new File(['not supported'], 'payload.exe')
    ]
    const preview = await previewHelpJuiceFiles(files)
    expect(preview).toMatchObject({ totalArticles:2,published:1,unpublished:1,categoryCount:2,categoryDepth:2,missingAnswers:1,duplicateSlugs:1,invalidCategoryReferences:1 })
    expect(preview.unsupported).toEqual(['payload.exe'])
    expect(preview.build?.answerResults[0]).toMatchObject({ questionId:'q1',answerId:'a1' })
  })

  it('previews only the first 100 data rows from files with more rows', async () => {
    const questionRows = Array.from({ length: 105 }, (_, index) => {
      const number = index + 1
      return number === 50 ? `q${number},"Article ${number}, first line\nsecond line"` : `q${number},Article ${number}`
    })
    const answerRows = Array.from({ length: 105 }, (_, index) => `a${index + 1},q${index + 1},Body ${index + 1}`)
    const questionPreview = await previewHelpJuiceFiles([
      new File([['id,name', ...questionRows].join('\n')], 'questions.csv')
    ])
    const answerPreview = await previewHelpJuiceFiles([
      new File([['id,question_id,body', ...answerRows].join('\n')], 'answers.csv')
    ])

    expect(questionPreview.questions?.headers).toEqual(['id', 'name'])
    expect(questionPreview.questions?.rows).toHaveLength(100)
    expect(answerPreview.answers?.rows).toHaveLength(100)
    expect(questionPreview.questions?.rows[49].values.name).toBe('Article 50, first line\nsecond line')
    expect(questionPreview.questions?.rows.at(-1)?.values.id).toBe('q100')
    expect(questionPreview.totalArticles).toBe(100)
  })
})
