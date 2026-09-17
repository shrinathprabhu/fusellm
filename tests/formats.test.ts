import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'
import { clock, formatMarkdown, outlineOf, parseCsv, readDocx, readXlsx, viewerFor } from '../src/lib/formats.ts'

test('viewerFor picks a viewer by extension, then MIME type', () => {
  assert.equal(viewerFor('notes.md'), 'markdown')
  assert.equal(viewerFor('clip', 'video/mp4'), 'video')
  assert.equal(viewerFor('voice.mp3'), 'audio')
  assert.equal(viewerFor('report.pdf'), 'pdf')
  assert.equal(viewerFor('data.csv'), 'table')
  assert.equal(viewerFor('book.xlsx'), 'sheet')
  assert.equal(viewerFor('brief.docx'), 'doc')
  assert.equal(viewerFor('package.json'), 'json')
  assert.equal(viewerFor('src/app.tsx'), 'text')
  assert.equal(viewerFor('Dockerfile'), 'text')
  assert.equal(viewerFor('logo.svg'), 'image')
  assert.equal(viewerFor('archive.zip', 'application/zip'), 'download')
})

test('formatMarkdown tidies prose and tables but leaves code alone', () => {
  const src = '#Title\nSome text \t\n* one\n+ two\n\n\n\n|a|bb|\n|-|:-:|\n|ccc|d|\n```js\n*  keep   \n\n\n\n```\nline with break  \nend'
  const out = formatMarkdown(src)
  assert.equal(
    out,
    '# Title\n\nSome text\n- one\n- two\n\n| a   | bb  |\n| --- | :-: |\n| ccc | d   |\n\n```js\n*  keep   \n\n\n\n```\n\nline with break  \nend\n',
  )
  assert.equal(formatMarkdown(out), out, 'formatting twice changes nothing')
})

test('outlineOf lists headings outside code fences', () => {
  assert.deepEqual(outlineOf('# A\ntext\n```\n# not a heading\n```\n## B *bold*'), [
    { level: 1, text: 'A' },
    { level: 2, text: 'B bold' },
  ])
})

test('parseCsv handles quotes, newlines in cells and guesses the delimiter', () => {
  assert.deepEqual(parseCsv('name,note\n"Smith, J","said ""hi""\nthen left"\nLee,ok\n'), [
    ['name', 'note'],
    ['Smith, J', 'said "hi"\nthen left'],
    ['Lee', 'ok'],
  ])
  assert.deepEqual(parseCsv('a\tb\r\n1\t2'), [
    ['a', 'b'],
    ['1', '2'],
  ])
  assert.deepEqual(parseCsv('a;b;c\n1;2;3'), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ])
})

test('readXlsx reads shared strings, numbers, inline strings and gaps', () => {
  const zip = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Sales &amp; costs" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Month</t></si><si><r><t>Rev</t></r><r><t>enue</t></r></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Jan</t></is></c><c r="C2"><v>1200.5</v></c></row></sheetData></worksheet>',
    ),
  })
  assert.deepEqual(readXlsx(zip), [
    {
      name: 'Sales & costs',
      rows: [
        ['Month', '', 'Revenue'],
        ['Jan', '', '1200.5'],
      ],
    },
  ])
})

test('readDocx turns a Word document into Markdown', () => {
  const p = (inner: string, style = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`
  const r = (t: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`
  const doc =
    '<w:document><w:body>' +
    p(r('Plan'), 'Heading1') +
    p(r('This is ') + r('bold', '<w:b/>') + r(' &amp; ') + r('it', '<w:i/>')) +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' + r('first') + '</w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' + r('second') + '</w:p>' +
    '<w:tbl><w:tr><w:tc>' + p(r('A')) + '</w:tc><w:tc>' + p(r('B')) + '</w:tc></w:tr><w:tr><w:tc>' + p(r('1')) + '</w:tc><w:tc>' + p(r('2')) + '</w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>'
  const md = readDocx(zipSync({ 'word/document.xml': strToU8(doc) }))
  assert.equal(md, '# Plan\n\nThis is **bold** & *it*\n\n- first\n- second\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')
  assert.throws(() => readDocx(zipSync({ 'other.xml': strToU8('<x/>') })))
})

test('clock formats seconds for players', () => {
  assert.equal(clock(0), '0:00')
  assert.equal(clock(75.4), '1:15')
  assert.equal(clock(75.46, true), '1:15.5')
  assert.equal(clock(3725), '1:02:05')
  assert.equal(clock(NaN), '0:00')
})
