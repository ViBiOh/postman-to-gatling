#!/usr/bin/env node

const fs = require('fs');
let colors;

const log = {
    success: function (message) {
        console.info((colors ? message.green : message));
    },
    info: function (message) {
        console.info((colors ? message.blue : message));
    },
    warn: function (message) {
        console.info((colors ? message.yellow : message));
    },
    error: function (message) {
        console.info((colors ? message.red : message));
    },
    french: function (message) {
        console.info((colors ? message.america : message));
    }
};

try {
    colors = require('colors');
} catch (e) {
    log.error('No colors dependency found, Black&White is fun too !\n');
    colors = undefined;
}

function Request(postman) {
    var self = this instanceof Request ? this : Object.create(Request.prototype);

    self.name = postman.name;
    self.postman = postman;

    self.method = undefined;
    self.url = undefined;
    self.auth = undefined;
    self.headers = {};
    self.body = undefined;
    self.checks = [];

    return self;
}

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

function Simulation() {
    var self = this instanceof Simulation ? this : Object.create(Simulation.prototype);

    self.name = undefined;
    self.outputName = undefined;

    self.collection = {
        postman: undefined,
        requests: [],
        reqStr: ''
    };
    self.environment = {
        postman: {
            values: []
        },
        feeder: {}
    };

    return self;
}

Simulation.prototype.loadEnvironnement = function (environmentFile) {
    var self = this;

    if (environmentFile !== undefined) {
        self.environment.postman = JSON.parse(fs.readFileSync(environmentFile, 'utf8'));
    }
};

Simulation.prototype.loadCollection = function (collectionFile, args) {
    var self = this;

    self.collection.postman = JSON.parse(fs.readFileSync(collectionFile, 'utf8'));
    self.name = self.collection.postman.name;
    self.outputName = args.output ? args.output : self.name;
};

Simulation.prototype.buildFeeder = function () {
    var self = this;

    for (var i = 0, size = self.environment.postman.values.length; i < size; i += 1) {
        if (self.environment.postman.values[i].enabled) {
            self.environment.feeder[self.environment.postman.values[i].key] = varString(self.environment.postman.values[i].value);
        }
    }

    var updated = true;

    function varReplace(matchAll, varKey) {
        updated = true;
        return self.environment.feeder[varKey];
    }

    while (updated) {
        updated = false;

        for (var key in self.environment.feeder) {
            if ({}.hasOwnProperty.call(self.environment.feeder, key)) {
                self.environment.feeder[key] = self.environment.feeder[key].replace(/\$\{(.*?)\}/gmi, varReplace);
            }
        }
    }
};

Simulation.prototype.buildRequests = function () {
    var self = this;

    var folders = self.collection.postman.folders.sort(function (a, b) {
        if (a.name < b.name) {
            return -1;
        } else if (a.name === b.name) {
            return 0;
        }
        return 1;
    });

    for (var i = 0, size = folders.length; i < size; i += 1) {
        self.buildCollection(folders[i]);
    }

    self.buildCollection(self.collection.postman);
};

Simulation.prototype.buildCollection = function (collection) {
    var self = this;

    for (var i = 0, size = collection.order.length; i < size; i += 1) {
        var request = new Request(self.getRawRequest(collection.order[i])).build();
        self.collection.requests.push(request);
    }
};

Simulation.prototype.getRawRequest = function (id) {
    var self = this;

    for (var i = 0, size = self.collection.postman.requests.length; i < size; i += 1) {
        if (self.collection.postman.requests[i].id === id) {
            return self.collection.postman.requests[i];
        }
    }
};

Simulation.prototype.toScala = function () {
    var self = this;

    if (!fs.existsSync(GATLING_BODIES + self.outputName)) {
        fs.mkdirSync(GATLING_BODIES + self.outputName);
    }

    var str = '';

    for (var i = 0, size = self.collection.requests.length; i < size; i += 1) {
        str += self.collection.requests[i].toScala(self.outputName, 2);
    }

    return str;
};

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

Request.prototype.buildAuth = function () {
    var self = this;

    if (self.postman.currentHelper === 'basicAuth') {
        self.auth = {
            type: 'basic',
            user: varString(self.postman.helperAttributes.username),
            psw: varString(self.postman.helperAttributes.password)
        };
    }
};

Request.prototype.buildHeaders = function () {
    var self = this;

    function manageHeader(matchAll, headerKey, headerValue) {
        if (!self.auth || self.auth && headerKey !== 'Authorization') {
            self.headers[varString(headerKey)] = varString(headerValue);
        }
    }

    var rawHeaders = self.postman.headers.split(/\n/gmi);
    for (var i = 0, size = rawHeaders.length; i < size; i += 1) {
        if (rawHeaders[i] !== '') {
            rawHeaders[i].replace(/(.*?):\s?(.*)/gmi, manageHeader);
        }
    }
};

Request.prototype.buildBody = function () {
    var self = this;

    if (self.postman.dataMode === 'raw') {
        self.body = {
            filename: self.name.replace(/[^a-zA-Z0-9-]/gm, '_') + '_stringbody.txt',
            content: varString(self.postman.rawModeData)
        };
    } else if (self.postman.dataMode === 'binary') {
        self.body = {
            filename: 'YOUR_FILENAME_HERE'
        };

        if (self.headers['Content-Disposition']) {
            self.headers['Content-Disposition'].replace(/filename\*?=(?:.*?'')?["']?(.*)["']?/mi, function (matchAll, headerFilename) {
                if (headerFilename !== undefined) {
                    self.body.filename = headerFilename;
                }
            });
        }
    }
};

Request.prototype.buildChecks = function () {
    var self = this;

    function stringVar(name, value) {
        var checked = false;

        value.replace(/['"](.*?)['"]/gmi, function (matchAll, string) {
            self.checks.push({
                type: 'string',
                name: name,
                value: string
            });

            checked = true;
        });

        return checked;
    }

    function jsonCheck(name, value, postman, path) {
        var checked = false;

        var jsonPath = '';
        if (path !== undefined) {
            jsonPath = path;
        } else {
            value.replace(/(.*?)\.(.*)/mi, function (matchAll, sourceVariable, sourcePath) {
                postman.replace(new RegExp(sourceVariable + '\\s*=\\s*JSON.parse\\((\\w*)\\)', 'm'), function (matchAll, jsonSource) {
                    if (jsonSource === 'responseBody') {
                        jsonPath = sourcePath;
                    }
                });
            });
        }

        if (jsonPath !== '') {
            self.checks.push({
                type: 'json',
                name: name,
                value: jsonPath
            });

            checked = true;
        }

        return checked;
    }

    self.postman.tests.replace(/postman\.(?:setEnvironmentVariable|setGlobalVariable)\s*\(\s*['"](\w*)['"]\s*,\s*(.*?)\)(?:\s*;?\s*\/\/JSONPath=([^\n]*))?/gm, function (matchAll, varName, varValue, jsonPath) {
        if (!stringVar(varName, varValue)) {
            jsonCheck(varName, varValue, self.postman.tests, jsonPath);
        }
    });

    var statusCheckCount = 0;
    self.postman.tests.replace(/tests\s*\[["'].*?["']]\s*=\s*(.*?)[;\n]/gm, function (matchAll, testCode) {
        testCode.replace(/responseCode\.code\s*={2,3}\s*(\d{2,3})(?:\s*\|\|\s*)?/gm, function (matchAll, httpCode) {
            statusCheckCount += 1;
            if (statusCheckCount === 1) {
                self.checks.push({
                    type: 'status',
                    value: httpCode
                });
            } else {
                messages.push('For request <' + self.name + '> : Multiple HTTP status check is not currently supported');
            }
        });
    });
};

Request.prototype.toScala = function (outputName, offset) {
    var self = this;

    var str = '';

    str += indent(offset) + '.exec(http("' + self.name + '")\n';
    str += indent(offset + 1) + '.' + self.method + '("' + self.url + '")\n';
    if (self.auth) {
        if (self.auth.type === 'basic') {
            str += indent(offset + 1) + '.basicAuth("' + self.auth.user + '", "' + self.auth.psw + '")\n';
        }
    }

    for (var key in self.headers) {
        if ({}.hasOwnProperty.call(self.headers, key)) {
            str += indent(offset + 1) + '.header("' + key + '", "' + self.headers[key] + '")\n';
        }
    }

    if (self.body !== undefined) {
        var filename = outputName + '/' + self.body.filename;
        var absolutPath = GATLING_BODIES + filename;

        if (self.body.content !== undefined) {
            var bodyFile = fs.openSync(absolutPath, 'w');
            fs.writeSync(bodyFile, self.body.content);
            fs.closeSync(bodyFile);
        }

        str += indent(offset + 1) + '.body(RawFileBody("' + filename + '"))\n';
        if (!fs.existsSync(absolutPath)) {
            messages.push('For request <' + self.name + '> : Please provide file ' + absolutPath);
        }
    }

    if (self.checks.length > 0) {
        str += indent(offset + 1) + '.check(\n';

        for (var i = 0, checksSize = self.checks.length; i < checksSize; i += 1) {
            if (i !== 0) {
                str += ',\n';
            }

            if (self.checks[i].type === 'string') {
                str += indent(offset + 2) + 'status.transform(string => "' + self.checks[i].value + '").saveAs("' + self.checks[i].name + '")';
            } else if (self.checks[i].type === 'json') {
                str += indent(offset + 2) + 'jsonPath("$.' + self.checks[i].value + '").saveAs("' + self.checks[i].name + '")';
            } else if (self.checks[i].type === 'status') {
                str += indent(offset + 2) + 'status.is(' + self.checks[i].value + ')';
            }
        }

        str += '\n' + indent(offset + 1) + ')\n';
    }

    str += indent(offset) + ')\n';

    return str;
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
