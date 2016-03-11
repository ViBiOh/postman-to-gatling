'use strict';

const messages = [];

module.exports = {
  add: (message) => {
    messages.push(message);
  },
  display: (logger) => {
    messages.forEach(message => {
      logger.warn(message);
    });
  },
};
