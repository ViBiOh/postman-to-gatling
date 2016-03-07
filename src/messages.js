'use strict';

const messages = [];

module.exports = {
  add: (message) => {
    messages.push(message);
  },
  iterate: (fn) => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      Reflect.apply(fn, messages[i], i);
    }
  },
};
