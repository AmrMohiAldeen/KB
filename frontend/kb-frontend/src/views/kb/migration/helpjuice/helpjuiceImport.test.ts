import { describe, expect, it } from 'vitest'

import { parseHelpJuiceCsv } from './csv'
import { buildHelpJuiceImport, createHelpJuicePreparedImportPayload } from './helpjuiceImport'

describe('HelpJuice migration import utilities', () => {
  it('parses quoted CSV values with commas and multiline fields', () => {
    const parsed = parseHelpJuiceCsv(
      ['id,name,description', '"1","Article, One","Line one', 'Line two"', ''].join('\n'),
      'questions'
    )

    expect(parsed.issues).toHaveLength(0)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].values.name).toBe('Article, One')
    expect(parsed.rows[0].values.description).toBe('Line one\nLine two')
  })

  it('creates one candidate per question and combines multiple matching answers', () => {
    const questions = parseHelpJuiceCsv(
      [
        'id,name,codename,is_published,views,joined_tag_names',
        '1,First Article,first-article,TRUE,"1,200","alpha,beta"',
        '2,Second Article,second-article,FALSE,4,'
      ].join('\n'),
      'questions'
    )
    const answers = parseHelpJuiceCsv(
      [
        'id,question_id,user_id,body',
        'a1,1,u1,"<p>Hello, <strong>world</strong></p>"',
        'a2,1,u2,"<p>Second body</p>"',
        'orphan,404,u3,"<p>Orphan body</p>"'
      ].join('\n'),
      'answers'
    )

    const result = buildHelpJuiceImport({ questions, answers })
    const firstCandidate = result.candidates[0]
    const secondCandidate = result.candidates[1]

    expect(result.candidates).toHaveLength(2)
    expect(firstCandidate.sourceAnswerIds).toEqual(['a1', 'a2'])
    expect(firstCandidate.sourceAuthorIds).toEqual(['u1', 'u2'])
    expect(firstCandidate.sourceViews).toBe(1200)
    expect(firstCandidate.sourceIsPublished).toBe(true)
    expect(firstCandidate.sourceKeywordNames).toBe('alpha,beta')
    expect(firstCandidate.htmlBody).toContain('data-helpjuice-answer-separator')
    expect(firstCandidate.plainTextBody).toContain('Hello')
    expect(firstCandidate.warnings).toContain('2 answers were combined into one article body.')
    expect(secondCandidate.warnings).toContain('No matching answer body was found for this question.')
    expect(result.validationIssues.some(issue => issue.message.includes('no matching question exists'))).toBe(true)
  })

  it('reports required header and required row value errors', () => {
    const questions = parseHelpJuiceCsv(['id,name', '1,Missing Answer Body'].join('\n'), 'questions')
    const answers = parseHelpJuiceCsv(['id,question_id', 'a1,1'].join('\n'), 'answers')
    const result = buildHelpJuiceImport({ questions, answers })

    expect(result.validationIssues.some(issue => issue.severity === 'error' && issue.message.includes('"body"'))).toBe(
      true
    )
    expect(result.validationIssues.some(issue => issue.severity === 'error' && issue.message.includes('missing required body'))).toBe(
      true
    )
  })

  it('prepares a payload without calling a backend API', () => {
    const questions = parseHelpJuiceCsv(['id,name', '1,Ready Article'].join('\n'), 'questions')
    const answers = parseHelpJuiceCsv(['id,question_id,body', 'a1,1,<p>Ready</p>'].join('\n'), 'answers')
    const result = buildHelpJuiceImport({ questions, answers })
    const payload = createHelpJuicePreparedImportPayload({
      result,
      questionsFileName: 'questions.csv',
      answersFileName: 'answers.csv'
    })

    expect(payload.source).toBe('helpjuice')
    expect(payload.sourceFiles).toEqual({
      questionsFileName: 'questions.csv',
      answersFileName: 'answers.csv'
    })
    expect(payload.candidates).toHaveLength(1)
    expect(payload.candidates[0].tiptapJson).toEqual(expect.objectContaining({ type: 'doc' }))
  })
})
