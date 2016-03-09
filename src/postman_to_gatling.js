#!/usr/bin/env node

'use strict';

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
    normalize: true,
    describe: 'path of gatling home dir. Affect body, data and simulations paths',
  }).options('bodies', {
    alias: 'b',
    type: 'string',
    default: '/user-files/bodies/',
    normalize: true,
    describe: 'path where bodies will be written',
  }).options('data', {
    alias: 'd',
    type: 'string',
    default: '/user-files/data/',
    normalize: true,
    describe: 'path where session\'s data will be written',
  }).options('simulation', {
    alias: 's',
    type: 'string',
    default: '/user-files/simulations/',
    normalize: true,
    describe: 'path where scenario will be written',
  }).options('template', {
    alias: 't',
    type: 'string',
    default: './src/postman2gatling_template.scala',
    normalize: true,
    describe: 'path to scala template file',
  }).options('output', {
    alias: 'o',
    type: 'string',
    describe: 'collection output name',
  })
  .help('help')
  .strict()
  .argv;

const simulation = new Simulation();
simulation.load(options.environment, options.collection).then(() => {
  simulation.build();

  if (options.output) {
    simulation.outputName(options.output);
  }
  simulation.generate(options.home, options.data, options.bodies, options.simulation, options.template).then(() => {
    messages.display(logger);
  }, err => logger.fatal(err));
}, err => logger.fatal(err))
.catch(err => logger.fatal(err));
