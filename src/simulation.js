'use strict';

const fs = require('fs');
const readFile = require('js-utils').asyncifyCallback(fs.readFile);
const writeFile = require('js-utils').asyncifyCallback(fs.writeFile);
const stringify = require('js-utils').stringify;
const logger = require('node-logger').getLogger('postmanToGatling');
const Request = require('./request.js');

module.exports = class Simulation {
  constructor() {
    this.environments = [];
    this.requests = [];
    this.feeder = {};
  }

  loadEnvironnement(environmentFile) {
    if (environmentFile) {
      return readFile(environmentFile, 'utf8').then(data => {
        this.environments = JSON.parse(data).values;
      });
    }

    return Promise.resolve();
  }

  loadCollection(collectionFile) {
    return readFile(collectionFile, 'utf8').then(data => {
      this.collections = JSON.parse(data);
      this.name = this.collections.name;
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

      for (const key in this.feeder) {
        if ({}.hasOwnProperty.call(this.feeder, key)) {
          this.feeder[key] = this.feeder[key].replace(/\$\{(.*?)\}/gmi, varReplace);
        }
      }
    }
  }

  buildRequests() {
    const folders = this.collections.folders ? this.collections.folders.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      } else if (a.name === b.name) {
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
    return undefined;
  }

  generateEnvironments(options) {
    if (this.environments.length > 0) {
      logger.info(`Generating Gatling environment file for ${this.name}`);
      return writeFile(`${options.home}${options.data}${this.name}.json`, stringify(this.feeder, ' '));
    }
    return Promise.resolve();
  }

  generateTemplate(options) {
    return new Promise(resolve => {
      const promises = [];
      let str = '';

      function code(codeStr) {
        str += codeStr;
      }

      for (let i = 0, size = this.requests.length; i < size; i += 1) {
        const requestPromise = this.requests[i].generate(this.name, 2, `${options.home}${options.bodies}`);
        promises.push(requestPromise);
        requestPromise.then(append => {
          code(append);
        });
      }

      Promise.all(promises).then(() => {
        resolve(str);
      });
    });
  }

  generate(options) {
    return Promise.all([
      this.generateEnvironments(options),
      this.generateTemplate(options),
    ]);
  }
};
