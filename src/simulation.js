'use strict';

const fs = require('fs');
const readFile = require('js-utils').asyncifyCallback(fs.readFile);
const writeFile = require('js-utils').asyncifyCallback(fs.writeFile);
const access = require('js-utils').asyncifyCallback(fs.access);
const mkdir = require('js-utils').asyncifyCallback(fs.mkdir);
const stringify = require('js-utils').stringify;
const logger = require('node-logger').getLogger('postmanToGatling');
const Request = require('./request.js');

module.exports = class Simulation {
  constructor() {
    this.environments = [];
    this.requests = [];
    this.feeder = {};
  }

  load(environmentFile, collectionFile) {
    return Promise.all([
      this.loadEnvironnement(environmentFile),
      this.loadCollection(collectionFile),
    ]);
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

  build() {
    this.buildFeeder();
    this.buildRequests();
  }

  buildFeeder() {
    for (let i = this.environments.length - 1; i >= 0; i -= 1) {
      if (this.environments[i].enabled) {
        this.feeder[this.environments[i].key] = this.environments[i].value.replace(/\{\{(.*?)\}\}/gmi, '${$1}');
      }
    }

    this.flatEnvironmentVariables();
  }

  flatEnvironmentVariables() {
    const self = this;

    let updated = true;
    function varReplace(matchAll, varKey) {
      updated = true;
      return self.feeder[varKey];
    }

    while (updated) {
      updated = false;

      for (const key in this.feeder) {
        if (Object.hasOwnProperty.call(this.feeder, key)) {
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

    for (let i = 0, size = folders.length; i < size; i += 1) {
      this.buildCollection(folders[i]);
    }
    this.buildCollection(this.collections);
  }

  buildCollection(collection) {
    for (let i = 0, size = collection.order.length; i < size; i += 1) {
      this.requests.push(new Request(this.getRawRequest(collection.order[i])).build());
    }
  }

  getRawRequest(id) {
    for (let i = 0, size = this.collections.requests.length; i < size; i += 1) {
      if (this.collections.requests[i].id === id) {
        return this.collections.requests[i];
      }
    }
    return undefined;
  }

  createBodyDirectory(home, bodies) {
    return new Promise(resolve => {
      access(home + bodies, fs.W_OK).then(resolve, mkdir(home + bodies).then(resolve));
    });
  }

  generateEnvironments(home, data) {
    if (this.environments.length > 0) {
      logger.info(`Generating Gatling environment file for ${this.name}`);
      return writeFile(`${home}${data}${this.name}.json`, stringify(this.feeder, ' '));
    }
    return Promise.resolve();
  }

  generateTemplate(home, bodies) {
    return new Promise(resolve => {
      const promises = [];
      let str = '';

      function code(codeStr) {
        str += codeStr;
      }

      for (let i = 0, size = this.requests.length; i < size; i += 1) {
        const requestPromise = this.requests[i].generate(this.name, 2, `${home}${bodies}`);
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

  writeTemplate(home, simulation, templatePath, requestsTemplate) {
    return new Promise(resolve => {
      readFile(templatePath, 'utf8').then(templateData => {
        const cleanTemplate = templateData.replace(/\{\{(outputName)\}\}/gmi, this.name).replace(/\{\{(requests)\}\}/mi, requestsTemplate);
        fs.writeFile(`${home}${simulation}${this.name}.scala`, cleanTemplate, resolve);
      });
    });
  }

  generate(home, data, bodies, simulation, templatePath) {
    return new Promise(resolve => {
      this.createBodyDirectory(home, bodies).then(() => {
        Promise.all([
          this.generateEnvironments(home, data),
          this.generateTemplate(home, bodies),
        ]).then(values => {
          this.writeTemplate(home, simulation, templatePath, values[1]).then(resolve);
        });
      });
    });
  }
};
