'use strict';

const messages = [];

module.exports = {
  add: (message) => {
    messages.push(message);
  },
  display: (logger) => {
    for (let i = 0, size = messages.length; i < size; i += 1) {
      logger.warn(messages[i]);
    }
  },
};
