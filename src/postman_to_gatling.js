#!/usr/bin/env node

'use strict';

const fs = require('fs');
const readFile = require('js-utils').asyncifyCallback(fs.readFile);
const logger = require('node-logger').getLogger('postmanToGatling');
const Simulation = require('./simulation.js');
const messages = require('./messages.js');

logger.info('Postman to Gatling');

const options = require('yargs')
  .reset()
  .options('collection', {
    alias: 'c',
    required: true,
    type: 'string',
    describe: 'export of Postman\'s collection in JSON format',
  })
  .options('environment', {
    alias: 'e',
    type: 'string',
    describe: 'export of Postman\'s environment in JSON format',
  })
  .options('output', {
    alias: 'o',
    type: 'string',
    describe: 'output base file name',
  }).options('home', {
    alias: 'h',
    type: 'string',
    default: './gatling',
    describe: 'path of gatling home dir. Affect body, data and simulations paths',
  }).options('bodies', {
    alias: 'b',
    type: 'string',
    default: '/user-files/bodies/',
    describe: 'path where bodies will be written',
  }).options('data', {
    alias: 'd',
    type: 'string',
    default: '/user-files/data/',
    describe: 'path where session\'s data will be written',
  }).options('simulation', {
    alias: 's',
    type: 'string',
    default: '/user-files/simulations/',
    describe: 'path where scenario will be written',
  }).options('template', {
    alias: 't',
    type: 'string',
    default: './src/postman2gatling_template.scala',
    describe: 'path to scala template file',
  })
  .help('help')
  .strict()
  .argv;

function fillTemplate(simulation) {
  logger.info(`Generating Gatling scenario for ${simulation.name}`);

  return readFile(options.template, 'utf8').then(template => {
    simulation.generate(options).then(data => {
      const cleanTemplate = template.replace(/\{\{(outputName)\}\}/gmi, simulation.outputName).replace(/\{\{(requests)\}\}/mi, data);

      fs.writeFile(`${options.home}${options.simulation}${simulation.name}.scala`, cleanTemplate);
    });
  });
}

function displayWarn() {
  messages.iterate(message => {
    logger.warn(`  ${message}`);
  });
}

const simulation = new Simulation();
Promise.all([
  simulation.loadEnvironnement(options.environment),
  simulation.loadCollection(options.collection),
]).then(() => {
  simulation.buildFeeder();
  simulation.buildRequests();

  Promise.all([
    fillTemplate(simulation),
  ]).then(() => {
    displayWarn();
  });
}).catch(err => {
  logger.fatal(err);
});
