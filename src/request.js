'use strict';

const fs = require('fs');
const exists = require('js-utils').asyncifyCallback(fs.exists);
const messages = require('./messages');

function varString(value) {
  return value.replace(/\{\{(.*?)\}\}/gmi, '${$1}');
}

function indent(times) {
  let str = '';

  let index = 0;
  while (index < times) {
    str += '  ';
    index += 1;
  }

  return str;
}

module.exports = class Request {
  constructor(postman) {
    this.name = postman.name;
    this.postman = postman;

    this.headers = {};
    this.checks = [];
  }

  buildAuth() {
    if (this.postman.currentHelper === 'basicAuth') {
      this.auth = {
        type: 'basic',
        user: varString(this.postman.helperAttributes.username),
        psw: varString(this.postman.helperAttributes.password),
      };
    }
  }

  buildHeaders() {
    const self = this;

    function manageHeader(matchAll, headerKey, headerValue) {
      if (!self.auth || self.auth && headerKey !== 'Authorization') {
        self.headers[varString(headerKey)] = varString(headerValue);
      }
    }

    const rawHeaders = self.postman.headers.split(/\n/gmi);
    for (let i = 0, size = rawHeaders.length; i < size; i += 1) {
      if (rawHeaders[i] !== '') {
        rawHeaders[i].replace(/(.*?):\s?(.*)/gmi, manageHeader);
      }
    }
  }

  buildBody() {
    const self = this;

    if (self.postman.dataMode === 'raw') {
      self.body = {
        filename: `${self.name.replace(/[^a-zA-Z0-9-]/gm, '_')}_stringbody.txt`,
        content: varString(self.postman.rawModeData),
      };
    } else if (self.postman.dataMode === 'binary') {
      self.body = {
        filename: 'YOUR_FILENAME_HERE',
      };

      if (self.headers['Content-Disposition']) {
        self.headers['Content-Disposition'].replace(/filename\*?=(?:.*?'')?["']?(.*)["']?/mi
          , (matchAll, headerFilename) => {
            if (headerFilename) {
              self.body.filename = headerFilename;
            }
          });
      }
    }
  }

  buildChecks() {
    const self = this;

    function stringVar(name, value) {
      let checked = false;

      value.replace(/['"](.*?)['"]/gmi, (matchAll, string) => {
        self.checks.push({
          type: 'string',
          name,
          value: string,
        });

        checked = true;
      });

      return checked;
    }

    function jsonCheck(name, value, postman, path) {
      let checked = false;

      let jsonPath = '';
      if (path) {
        jsonPath = path;
      } else {
        value.replace(/(.*?)\.(.*)/mi, (matchAll, sourceVariable, sourcePath) => {
          postman.replace(new RegExp(`${sourceVariable}\\s*=\\s*JSON.parse\\((\\w*)\\)`, 'm')
            , (subAll, jsonSource) => {
              if (jsonSource === 'responseBody') {
                jsonPath = sourcePath;
              }
            });
        });
      }

      if (jsonPath !== '') {
        self.checks.push({
          type: 'json',
          name,
          value: jsonPath,
        });

        checked = true;
      }

      return checked;
    }

    self.postman.tests.replace(/postman\.(?:setEnvironmentVariable|setGlobalVariable)\s*\(\s*['"](\w*)['"]\s*,\s*(.*?)\)(?:\s*;?\s*\/\/JSONPath=([^\n]*))?/gm, (matchAll, varName, varValue, jsonPath) => {
      if (!stringVar(varName, varValue)) {
        jsonCheck(varName, varValue, self.postman.tests, jsonPath);
      }
    });

    let statusCheckCount = 0;
    self.postman.tests.replace(/tests\s*\[["'].*?["']]\s*=\s*(.*?)[;\n]/gm,
      (matchAll, testCode) => {
        testCode.replace(/responseCode\.code\s*={2,3}\s*(\d{2,3})(?:\s*\|\|\s*)?/gm,
          (subAll, httpCode) => {
            statusCheckCount += 1;
            if (statusCheckCount === 1) {
              self.checks.push({
                type: 'status',
                value: httpCode,
              });
            } else {
              messages.push(`For request <${self.name}> : Multiple HTTP status check is not currently supported`);
            }
          });
      });
  }

  build() {
    this.method = varString(this.postman.method.toLowerCase());
    this.url = varString(this.postman.url);

    this.buildAuth();
    this.buildHeaders();
    this.buildBody();
    this.buildChecks();

    return this;
  }

  generate(outputName, offset, bodiesPath) {
    let str = '';

    str += `${indent(offset)}.exec(http("${this.name}")\n`;
    str += `${indent(offset + 1)}.${this.method}("${this.url}")\n`;
    if (this.auth) {
      if (this.auth.type === 'basic') {
        str += `${indent(offset + 1)}.basicAuth("${this.auth.user}", "${this.auth.psw}")\n'`;
      }
    }

    for (const key in this.headers) {
      if ({}.hasOwnProperty.call(this.headers, key)) {
        str += `${indent(offset + 1)}.header("${key}", "${this.headers[key]}")\n`;
      }
    }

    if (this.body) {
      const filename = `${outputName}/${this.body.filename}`;
      const absolutPath = bodiesPath + filename;

      if (this.body.content) {
        fs.writeFile(absolutPath, this.body.content);
      }

      str += `${indent(offset + 1)}'.body(RawFileBody("${filename}"))\n`;
      exists(absolutPath).then(exists => {
        if (!exists) {
          messages.add(`For request <${this.name}> : Please provide file ${absolutPath}`);
        }
      });
    }

    if (this.checks.length > 0) {
      str += `${indent(offset + 1)}'.check(\n`;

      for (let size = this.checks.length, i = 0; i < size; i += 1) {
        if (i !== 0) {
          str += ',\n';
        }

        if (this.checks[i].type === 'string') {
          str += `${indent(offset + 2)}status.transform(string => "${this.checks[i].value}").saveAs("${this.checks[i].name}")`;
        } else if (this.checks[i].type === 'json') {
          str += `${indent(offset + 2)}jsonPath("$.${this.checks[i].value}").saveAs("${this.checks[i].name}")`;
        } else if (this.checks[i].type === 'status') {
          str += `${indent(offset + 2)}status.is(${this.checks[i].value})`;
        }
      }

      str += `\n${indent(offset + 1)})\n`;
    }

    str += `${indent(offset)})\n`;

    return str;
  }
};
