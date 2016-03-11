'use strict';

const fs = require('fs');
const readFile = require('js-utils').asyncifyCallback(fs.readFile);
const writeFile = require('js-utils').asyncifyCallback(fs.writeFile);
const stringify = require('js-utils').stringify;
const logger = require('node-logger').getLogger('postmanToGatling');
const Request = require('./request');
const promises = require('./promises');
const placeholderReplacer = require('./commons').variablePlaceholderToShellVariable;
const createDirIfNecessary = require('./commons').createDirIfNecessary;

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
    this.environments.forEach(environment => {
      if (environment.enabled) {
        this.feeder[environment.key] = placeholderReplacer(environment.value);
      }
    });

    this.resolveEnvironmentVariables();
  }

  outputName(outputName) {
    this.name = outputName;
  }

  resolveEnvironmentVariables() {
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
          this.feeder[key] = this.feeder[key].replace(/\${(.*?)}/gmi, varReplace);
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
    collection.order.forEach(requestIndex => {
      this.requests.push(new Request(this.getRawRequest(requestIndex)).build());
    });
  }

  getRawRequest(id) {
    for (let i = 0, size = this.collections.requests.length; i < size; i += 1) {
      if (this.collections.requests[i].id === id) {
        return this.collections.requests[i];
      }
    }
    return undefined;
  }

  generateEnvironments(environmentPath) {
    if (this.environments.length > 0) {
      logger.info(`Generating Gatling environment file for ${this.name} in ${environmentPath}`);
      promises.add(writeFile(`${environmentPath}${this.name}.json`, stringify(this.feeder, ' ')));
    }
  }

  generateTemplate(bodiesPath) {
    logger.info(`Generating Gatling template for ${this.name}`);

    let str = '';

    this.requests.forEach(request => {
      str += request.generate(this.name, 2, bodiesPath);
    });

    return str;
  }

  writeTemplate(simulationpath, templatePath, requestsTemplate) {
    logger.info(`Writing Gatling simulation file in ${simulationpath}`);

    return new Promise((resolve, reject) => {
      readFile(templatePath, 'utf8').then(templateData => {
        promises.add(writeFile(`${simulationpath}${this.name}.scala`, templateData.replace(/{{(outputName)}}/gmi, this.name).replace(/{{(requests)}}/mi, requestsTemplate)));
        resolve();
      }, reject);
    });
  }

  generate(home, data, bodies, simulation, templatePath) {
    return new Promise((resolve, reject) => {
      createDirIfNecessary(home + bodies + this.name).then(() => {
        this.generateEnvironments(home + data);
        promises.add(this.writeTemplate(home + simulation, templatePath, this.generateTemplate(home + bodies)));
        promises.all().then(() => {
          resolve();
          logger.info(`Successful generation for ${this.name}`);
        }, reject);
      }, reject);
    });
  }
};
