'use strict';

const fs = require('fs');
const access = require('js-utils').asyncifyCallback(fs.access);
const mkdir = require('js-utils').asyncifyCallback(fs.mkdir);

function isFunction(potentialFunction) {
  return potentialFunction && Object.prototype.toString.call(potentialFunction) === '[object Function]';
}

function mustachePlaceholder(str, key, callback) {
  const mustacheRegex = new RegExp(`{{${key}}`, 'gmi');
  if (isFunction(callback)) {
    return str.replace(mustacheRegex, value => callback(value));
  }
  return str.replace(mustacheRegex, callback);
}
module.exports.mustachePlaceholder = mustachePlaceholder;
module.exports.mustacheToShellVariable = str => mustachePlaceholder(str, '.*?', value => `\$\{${value}\}`);
module.exports.replaceShellVariable = (str, callback) => str.replace(/\${(.*?)}/gmi, '${$1}', (all, name) => {
  callback(name);
});
module.exports.escapeRegexString = str => str.replace(/([|\-\/\\()[.$^{}+?*\]])/g, '\\$1');
module.exports.splitHeader = (str, callback) => str.replace(/(.*?):\s?(.*)/gmi, (all, key, value) => callback(key, value));
module.exports.safeFilename = str => str.replace(/[^a-zA-Z0-9-]/gm, '_');
module.exports.stringVariable = (str, callback) => str.replace(/(["'`])((?:(?=(\\?))\3.)*?)\1/gmi, (all, quote, string) => callback(string));
module.exports.contentDispositionFilename = (str, callback) => str.replace(/filename\*?=(?:.*?'')?(["'`])((?:(?=(\\?))\3.)*?)\1/gmi, (all, quote, string) => callback(string));
module.exports.testHttpStatus = (str, callback) => str.replace(/tests\s*\[(["'`])((?:(?=(\\?))\3.)*?)\1]\s*=\s*(responseCode\.code\s*[<>=!]{1,3}\s*\d{2,3}.*?);/gm, (all, quote, test, escaped, testSyntax) => testSyntax.replace(/responseCode\.code\s*(!?)={2,3}\s*(\d{2,3})/gm, (subAll, inverse, httpCode) => callback(inverse, httpCode)));
module.exports.testBodyString = (str, callback) => str.replace(/tests\s*\[(["'`])((?:(?=(\\?))\3.)*?)\1]\s*=\s*(responseBody\.has\s*\(\s*.*?);/gm, (all, quote, test, escaped, testSyntax) => testSyntax.replace(/responseBody\.has\s*\(\s*(["'`])((?:(?=(\\?))\3.)*?)\1\)/gm, (subAll, subQuote, bodyString) => callback(bodyString)));

function checkWriteRight(path) {
  return access(path, fs.W_OK);
}

module.exports.checkWriteRight = checkWriteRight;

module.exports.createDirIfNecessary = path => new Promise((resolve, reject) => checkWriteRight(path).then(resolve, () => mkdir(path).then(resolve, reject)));

module.exports.indent = times => {
  let str = '';

  for (let i = times - 1; i >= 0; i -= 1) {
    str += '  ';
  }

  return str;
};
