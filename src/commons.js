'use strict';

module.exports.variablePlaceholderToShellVariable = value => {
  return value.replace(/\{\{(.*?)\}\}/gmi, '${$1}');
};

module.exports.indent = times => {
  let str = '';

  for (let i = times - 1; i >= 0; i -= 1) {
    str += '  ';
  }

  return str;
};
