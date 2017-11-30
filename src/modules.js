const { promisify } = require('util');
const moment = require('moment');
const crypto = require('crypto');
const chalk = require('chalk');
const fs = require('fs');
const uuid = require('uuid/v1');

const cwd = process.cwd();
const changeLogFolder = `${cwd}/_change-log`;

const FileContent = [{
  docID: new String(),
  content: new String()
}];

const parseJSON = (_JSON) => {
  return typeof _JSON === 'string' ? JSON.parse(_JSON) : _JSON;
};

const hashString = (string = new String()) => {
  const hash = crypto.createHash('sha256');
  return hash.update(string).digest('hex');
};

function hashChanges(
  fileContent = FileContent
) {
  const changesByDocID = fileContent.reduce((changesByDocID, { docID, content }) => {
    changesByDocID[docID] = hashString(content);
    return changesByDocID;
  }, {});
  return changesByDocID;
}

function writeChangesToFile(changes = new Object(), diff, algoliaIndexName = '') {
  console.log(chalk.yellow('writing file changes...'));
  const starttime = new Date().getTime();
  const JSONString = JSON.stringify({
    algoliaIndex: algoliaIndexName,
    changes,
    timestamp: moment().valueOf()
  });

  if (!fs.existsSync(changeLogFolder)) {
    fs.mkdirSync(changeLogFolder);
  }

  const results = promisify(fs.writeFile)(
    `${changeLogFolder}/changes-hash.json`,
    JSONString,
  ).then(() => {
    const fileCount = (diff.added.length + diff.changed.length);
    console.log(
      chalk.bold.green('log written', chalk.white(fileCount, 'files')),
      new Date().getTime() - starttime, 'ms'
    );
    return JSONString;
  });

  fs.writeFile(
    `${changeLogFolder}/last-diff.json`,
    JSON.stringify(diff, null, 2),
    (err) => {
      if (err) {
        console.log(chalk.red.bold(err));
      } else {
        console.log(chalk.yellow.bold('last diff may be viewed at ./change-log/last-diff.json'));
      }
    }
  );
  return results;
}

/*
  takes two [Object]s or JSON [String]s and shallowly compares them to get a list of
  changes
 */
const diffDefaultCallback = (newChanges, diff, changeID) => {
  if (process.env.NODE_ENV === 'development') {
    return;
  }
  writeChangesToFile(
    newChanges,
    diff,
    changeID
  );
};

function diffChanges(
  changes = String || Object,
  oldChanges = String || Object,
  callback = diffDefaultCallback
) {
  const { _new, _old } = {
    _new: parseJSON(changes),
    _old: parseJSON(oldChanges)
  };
  const added = [];
  const changed = [];
  Object.keys(_new).forEach(docID => {
    const _newHash = _new[docID];
    const _oldHash = _old[docID];
    if (typeof _oldHash === 'undefined') {
      added.push(docID);
    } else if (_newHash !== _oldHash) {
      changed.push(docID);
    }
  });
  const deleted = Object.keys(_old).filter(docID => {
    return !(docID in _new);
  });
  const changeID = uuid();
  const diff = { added, changed, deleted, changeID };
  callback(changes, diff, changeID);
  return diff;
}

const splitStringByCharLength = (string, charLength) => {
  const frags = [];
  const fragCount = Math.ceil(string.length / charLength);
  let i = 0;
  while (i < fragCount) {
    frags.push(
      string.slice(i * charLength, (i + 1) * charLength)
    );
    i++;
  }
  return frags;
};

const splitObjectsToFragments = (objects, fragmentSize = 9000) => {
  const newObjects = [];
  objects.forEach(o => {
    const { rawTextContent, docID, data } = o;
    const fragments = splitStringByCharLength(
      rawTextContent,
      fragmentSize
    );
    fragments.forEach(frag => {
      newObjects.push({
        docID,
        data,
        rawTextContent: frag
      });
    });
  });
  return newObjects;
};

module.exports = {
  hashString,
  hashChanges,
  diffChanges,
  changeLogFolder,
  splitObjectsToFragments
};
