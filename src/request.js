class Request {
    constructor(postman) {
        this.name = postman.name;
        this.postman = postman;

        this.method = undefined;
        this.url = undefined;
        this.auth = undefined;
        this.headers = {};
        this.body = undefined;
        this.checks = [];
    }
}

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

module.exports = Request;