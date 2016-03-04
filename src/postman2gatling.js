#!/usr/bin/env node

const Request = require('./request.js');
const Simulation = require('./simulation.js');

const fs = require('fs');
const colors = require('colors');

const log = {
    success: function (message) {
        console.log(message.green);
    },
    info: function (message) {
        console.log(message.blue);
    },
    warn: function (message) {
        console.log(message.yellow);
    },
    error: function (message) {
        console.log(message.red);
    },
    french: function (message) {
        console.log(message.america);
    }
};

let GATLING_HOME = process.env.GATLING_HOME ? process.env.GATLING_HOME : './gatling';

function homeBodies(envVariable) {
    return envVariable ? envVariable : GATLING_HOME + '/user-files/bodies/';
}

function homeData(envVariable) {
    return envVariable ? envVariable : GATLING_HOME + '/user-files/data/';
}

function homeSimulations(envVariable) {
    return envVariable ? envVariable : GATLING_HOME + '/user-files/simulations/';
}

let GATLING_BODIES = homeBodies(process.env.GATLING_BODIES);
let GATLING_DATA = homeData(process.env.GATLING_DATA);
let GATLING_SIMULATIONS = homeSimulations(process.env.GATLING_SIMULATIONS);
let GATLING_TEMPLATE = process.env.GATLING_TEMPLATE ? process.env.GATLING_TEMPLATE : 'postman2gatling_template.scala';

function varString(string) {
    return string.replace(/\{\{(.*?)\}\}/gmi, '${$1}');
}

function indent(times) {
    var str = '';

    var i = 0;
    while (i < times) {
        str += '\t';
        i += 1;
    }

    return str;
}
var messages = [];

function showExpectedCall(reason) {
    log.error('Usage: ./postman2gatling.js -c [collection_file] -e [environment_file]\n');
    log.error('Options:');
    log.error('\t-c            *required* export of Postman\'s collection in JSON format');
    log.error('\t-e            optional export of Postman\'s environment in JSON format');
    log.error('\t-o            optional output base file name (e.g. MyScenario)');
    log.error('\t--home        optional path of gatling home dir. Affect body, data and simulations paths if previously setted');
    log.error('\t--body        optional path where bodies will be written');
    log.error('\t--data        optional path where session\'s data will be written');
    log.error('\t--simulations optional path where scenario will be written');
    log.error('\t--template    optional path to scala template file');
    log.error('');
    log.error(reason + '\n');
}

function extractArgs() {
    if (process.argv.length % 2 !== 0) {
        showExpectedCall('Arguments number has to be a multiple of 2');
        return false;
    }

    var args = {};
    for (var i = 2, size = process.argv.length; i < size; i += 2) {
        switch (process.argv[i]) {
            case '-c':
            {
                args.collectionFile = process.argv[i + 1];
                break;
            }
            case '-e':
            {
                args.environmentFile = process.argv[i + 1];
                break;
            }
            case '-o':
            {
                args.output = process.argv[i + 1];
                break;
            }
            case '--home':
            {
                GATLING_HOME = process.argv[i + 1];
                GATLING_BODIES = homeBodies();
                GATLING_DATA = homeData();
                GATLING_SIMULATIONS = homeSimulations();
                break;
            }
            case '--body':
            {
                GATLING_BODIES = process.argv[i + 1];
                break;
            }
            case '--data':
            {
                GATLING_DATA = process.argv[i + 1];
                break;
            }
            case '--simulations':
            {
                GATLING_SIMULATIONS = process.argv[i + 1];
                break;
            }
            case '--template':
            {
                GATLING_TEMPLATE = process.argv[i + 1];
                break;
            }
            default:
            {
                log.error('Unknown argument : \'' + process.argv[i] + ' ' + process.argv[i + 1] + '\'\n');
            }
        }
    }

    if (args.collectionFile === undefined) {
        showExpectedCall('Missing required postman collection');
        return false;
    }

    return args;
}


Request.prototype.build = function () {
    var self = this;

    self.method = varString(self.postman.method.toLowerCase());
    self.url = varString(self.postman.url);

    self.buildAuth();
    self.buildHeaders();
    self.buildBody();
    self.buildChecks();

    return this;
};

function fillTemplate(simulation, args) {
    log.success('Generating Gatling scenario for ' + simulation.name);

    var template = fs.readFileSync(GATLING_TEMPLATE, 'utf8');

    template = template.replace(/\{\{(outputName)\}\}/gmi, simulation.outputName);
    template = template.replace(/\{\{(requests)\}\}/mi, simulation.toScala(args));

    var simulationFile = fs.openSync(GATLING_SIMULATIONS + (args.output ? args.output : simulation.name) + '.scala', 'w');
    fs.writeSync(simulationFile, template);
    fs.closeSync(simulationFile);
}

function writeData(simulation, args) {
    log.success('Generating Gatling environment file for ' + simulation.name);

    var feederFile = fs.openSync(GATLING_DATA + (args.output ? args.output : simulation.name) + '.json', 'w');
    fs.writeSync(feederFile, JSON.stringify([simulation.environment.feeder], '', '  ') + '\n');
    fs.closeSync(feederFile);
}

function displayWarn() {
    if (messages.length > 0) {
        log.warn('\nWarnings :\n');

        for (var i = 0, size = messages.length; i < size; i += 1) {
            log.warn('\t' + messages[i]);
        }
    }
}

log.french('Postman to Gatling\n');

var args = extractArgs();
if (!args) {
    process.exit(1);
}

log.info('GATLING_HOME        : ' + GATLING_HOME);
log.info('GATLING_BODIES      : ' + GATLING_BODIES);
log.info('GATLING_DATA        : ' + GATLING_DATA);
log.info('GATLING_SIMULATIONS : ' + GATLING_SIMULATIONS);
log.info('GATLING_TEMPLATE    : ' + GATLING_TEMPLATE);
log.info('');

var simulation = new Simulation();

simulation.loadEnvironnement(args.environmentFile);
simulation.loadCollection(args.collectionFile, args);
simulation.buildFeeder();
simulation.buildRequests();

fillTemplate(simulation, args);
writeData(simulation, args);
displayWarn();

log.info('');
