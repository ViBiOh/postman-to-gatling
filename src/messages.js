'use strict';

const messages = [];

module.exports = {
  add: (message) => {
    messages.push(message);
  },
  iterate: (fn) => {
    for (var index = messages.length - 1; index >= 0; index -= 1) {
      Reflect.apply(fn, messages[index], index);
    }
  }
};
