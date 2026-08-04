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

  it('keeps each matching answer as a separate migration record', () => {
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
    const firstRecord = result.answerResults[0]

    expect(firstRecord.answerId).toBe('a1')
    expect(firstRecord.questionId).toBe('1')
    expect(firstRecord.plainTextBody).toContain('Hello')
    expect(result.answerResults.map(record => record.answerId)).toEqual(['a1', 'a2', 'orphan'])
    expect(result.validationIssues.some(issue => issue.message.includes('no matching question exists'))).toBe(true)
  })

  it('reports required header and required row value errors', () => {
    const questions = parseHelpJuiceCsv(['id,name', '1,Missing Answer Body'].join('\n'), 'questions')
    const answers = parseHelpJuiceCsv(['id,question_id', 'a1,1'].join('\n'), 'answers')
    const result = buildHelpJuiceImport({ questions, answers })

    expect(result.validationIssues.some(issue => issue.severity === 'error' && issue.message.includes('"body"'))).toBe(
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
    expect(payload.answerResults).toHaveLength(1)
    expect(payload.answerResults[0].tiptapJson).toEqual(expect.objectContaining({ type: 'doc' }))
  })
})
