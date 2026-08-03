import { describe, expect, it } from 'vitest'
import { previewHelpJuiceFiles } from './clientPreview'

describe('HelpJuice client package preview', () => {
  it('detects required files and reports missing answers clearly', async () => {
    const questions = new File(['id,name\nq1,One'], 'questions.csv', { type: 'text/csv' })
    const preview = await previewHelpJuiceFiles([questions])
    expect(preview.missingRequired).toEqual(['answers.csv'])
    expect(preview.totalArticles).toBe(1)
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
})
