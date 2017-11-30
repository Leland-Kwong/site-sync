import test from 'ava';
import {
  hashChanges,
  hashString,
  diffChanges,
  splitObjectsToFragments
} from '../modules';

test('hashChanges', async t => {
  const fileContent = [
    { docID: 'foo.md', content: 'foo' },
    { docID: 'bar.md', content: 'bar' },
  ];

  const hashesToTestAgainst = fileContent.reduce((hashesByDocID, { docID, content }) => {
    const data = content;
    hashesByDocID[docID] = hashString(data);
    return hashesByDocID;
  }, {});

  const newHashString = JSON.stringify(hashChanges(fileContent));
  t.is(newHashString, JSON.stringify(hashesToTestAgainst));
});

test('diffChanges', t => {
  const _new = {
    'doc-1.md': hashString(''),
    'doc-2.md': hashString(''),
    'doc-4.md': hashString('')
  };
  const _old = {
    'doc-1.md': hashString('content foobar'),
    'doc-3.md': hashString('')
  };
  const { added, changed, deleted } = diffChanges(_new, _old);
  t.is(added.length, 2);
  t.is(changed.length, 1);
  t.is(deleted.length, 1);
});

test('split large documents', t => {
  const rawTextContent = 'lorem ipsum'.repeat(9000);
  const fragmentSize = 9000;
  const expectedFragmentLength = Math.ceil(rawTextContent.length / fragmentSize);
  const objects = [
    {
      rawTextContent,
      docID: 'foobar',
      data: {}
    }
  ];
  const fragments = splitObjectsToFragments(objects, fragmentSize);
  t.is(
    fragments.length,
    expectedFragmentLength
  );
});
