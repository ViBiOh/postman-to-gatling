const promises = [];

module.exports = {
  add: promise => promises.push(promise),
  all: () => Promise.all(promises),
};
