const fetch = require('isomorphic-fetch');
const { promisify } = require('util');
const fs = require('graceful-fs');
const chalk = require('chalk');
const uuid = require('uuid/v1');

const cwd = process.cwd();
const config = require(`${cwd}/search.config`);

const {
  hashString,
  hashChanges,
  diffChanges,
  changeLogFolder,
  writeChangesToFile,
  splitObjectsToFragments
} = require('./modules');

async function publishChanges(
  fromIndex,
  objectsToAddOrUpdate,
  objectsToDelete = [/* 'docID-1', 'docID-2', '...' */],
  newIndexName,
) {
  // create a query that includes all documents that match the particular docID.
  // This is needed since the documents may be split into fragments, so we can't just delete a doc by a single ID
  const createDeleteQuery = (objectsToDelete) => {
    return '(' + objectsToDelete
      .map(docID => {
        return `docID:${docID}`;
      })
      .join(' OR ') + ')';
  };

  let _fromIndex = fromIndex;
  if (!_fromIndex) {
    const initialIndex = uuid();
    const index = config.algolia.client.initIndex(initialIndex);
    _fromIndex = await new Promise((resolve, reject) => {
      index.addObject({ content: '' }, '__tempDoc__', function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(initialIndex);
        }
      });
    });
  }

  return new Promise((resolve) => {
    config.algolia.client.copyIndex(_fromIndex, newIndexName, function(err) {
      if (err) {
        console.log(chalk.red.bold('[ALGOLIA] - error publishing doc changes'), err);
        return;
      }
      const newIndex = config.algolia.client.initIndex(newIndexName);
      newIndex.setSettings(config.algolia.indexSettings);
      if (objectsToAddOrUpdate.length) {
        const objects = splitObjectsToFragments(objectsToAddOrUpdate);
        newIndex.addObjects(objects, function(err) {
          if (err) {
            console.log(chalk.red('ERROR ADDING ITEMS'), err.message);
          } else {
            console.log(chalk.green('ITEMS ADDED'));
          }
        });
      }
      if (objectsToDelete.length) {
        const delay = 3000;
        setTimeout(function deleteObjects() {
          newIndex.search({
            query: '',
            filters: createDeleteQuery(objectsToDelete)
          }, function(err, content) {
            // `newIndex` may not be ready, so we'll get an error here
            if (err) {
              console.log(chalk.red(err));
              // retry
              console.log('retrying in ', delay, 'ms');
              setTimeout(deleteObjects, delay);
              return;
            }
            const objectIDs = content.hits.map(({ objectID }) => objectID);
            newIndex.deleteObjects(objectIDs, function(err) {
              if (err) {
                console.log(chalk.red('ERROR DELETING ITEMS'), err);
              } else {
                console.log(chalk.green('SEARCH ITEMS DELETED'));
              }
            });
          });
        }, delay);
      }
      resolve();
    });
  });
}

function getChanges() {
  const { postsDir } = config;
  const markdownRe = /.md$/;
  const newChanges = promisify(fs.readdir)(postsDir)
    .then(files => {
      const fileContent = files.filter(f => f.match(markdownRe)).map(f => {
        return {
          docID: config.docID(f),
          content: fs.readFileSync(`${postsDir}/${f}`, 'utf-8')
        };
      });
      return hashChanges(fileContent);
    })
    .catch(err => {
      console.log(chalk.red.bold('error reading dir'), postsDir, err);
    });
  return newChanges;
}

async function cleanup() {
  console.log(chalk.green.bold('cleaning up unused indexes...'));
  const res = await fetch(config.versionUrl).then(res => res.json());
  // cleanup unused indexes
  const indexToKeep = res.algoliaIndex;
  const { client } = config.algolia;
  client.listIndexes((err, content) => {
    content.items
      .filter(({ name }) => name !== indexToKeep)
      .forEach(({ name }) => {
        client.deleteIndex(name, () => {
          console.log(chalk.green('[DELETED INDEX]'), name);
        });
      });
  });
}

module.exports = {
  hashChanges,
  hashString,
  diffChanges,
  publishChanges,
  getChanges,
  writeChangesToFile,
  cleanup,
  changeLogFolder,
};

const [, , method, ...args] = process.argv;

try {
  module.exports[method](...args);
} catch(err) {
}
