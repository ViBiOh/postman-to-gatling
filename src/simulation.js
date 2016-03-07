'use strict';

const fs = require('fs');
const Request = require('./request.js');

module.exports = class Simulation {
  constructor() {
    this.environments = [];
    this.requests = [];
    this.feeder = {};
  }

  loadEnvironnement(environmentFile) {
    if (environmentFile) {
      return new Promise((resolve, reject) => {
        fs.readFile(environmentFile, 'utf8', (err, data) => {
          if (err) {
            reject(err);
          }
          this.environments = JSON.parse(data).values;
          resolve();
        });
      });
    }

    return Promise.resolve();
  }

  loadCollection(collectionFile) {
    return new Promise((resolve, reject) => {
      fs.readFile(collectionFile, 'utf8', (err, data) => {
        if (err) {
          reject(err);
        }
        this.collections = JSON.parse(data);
        this.name = this.collections.name;
        resolve(this.collections);
      });
    });
  }

  buildFeeder() {
    const self = this;

    for (let index = this.environments.length - 1; index >= 0; index -= 1) {
      if (this.environments[index].enabled) {
        this.feeder[this.environments[index].key] = this.environments[index].value.replace(/\{\{(.*?)\}\}/gmi, '${$1}');
      }
    }

    let updated = true;
    function varReplace(matchAll, varKey) {
      updated = true;
      return self.feeder[varKey];
    }

    while (updated) {
      updated = false;

      for (let key in this.feeder) {
        if ({}.hasOwnProperty.call(this.feeder, key)) {
          this.feeder[key] = this.feeder[key].replace(/\$\{(.*?)\}/gmi, varReplace);
        }
      }
    }
  }

  buildRequests() {
    const folders = this.collections.folders ? this.collections.folders.sort((objA, objB) => {
      if (objA.name < objB.name) {
        return -1;
      } else if (objA.name === objB.name) {
        return 0;
      }
      return 1;
    }) : [];

    for (let index = 0, size = folders.length; index < size; index += 1) {
      this.buildCollection(folders[index]);
    }
    this.buildCollection(this.collections);
  }

  buildCollection(collection) {
    for (let index = 0, size = collection.order.length; index < size; index += 1) {
      this.requests.push(new Request(this.getRawRequest(collection.order[index])).build());
    }
  }

  getRawRequest(id) {
    for (let index = 0, size = this.collections.requests.length; index < size; index += 1) {
      if (this.collections.requests[index].id === id) {
        return this.collections.requests[index];
      }
    }
    return;
  }

  generate(bodiesPath) {
    const promise = new Promise(resolve => {
      fs.exists(bodiesPath + this.name, exists => {
        if (!exists) {
          fs.mkdir(bodiesPath + this.name, resolve);
        }
        resolve();
      });
    });

    return new Promise(resolve => {
      promise.then(() => {
        let str = '';
        for (let index = 0, size = this.requests.length; index < size; index += 1) {
          str += this.requests[index].generate(this.name, 2, bodiesPath);
        }
        resolve(str);
      });
    });
  }
};
