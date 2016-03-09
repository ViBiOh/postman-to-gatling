'use strict';

const fs = require('fs');
const access = require('js-utils').asyncifyCallback(fs.access);
const mkdir = require('js-utils').asyncifyCallback(fs.mkdir);

module.exports.variablePlaceholderToShellVariable = value => value.replace(/\{\{(.*?)\}\}/gmi, '${$1}');

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
