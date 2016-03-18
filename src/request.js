'use strict';

const fs = require('fs');
const writeFile = require('js-utils').asyncifyCallback(fs.writeFile);
const messages = require('./messages');
const promises = require('./promises');

const commons = require('./commons');
const indent = commons.indent;
const splitHeader = commons.splitHeader;
const safeFilename = commons.safeFilename;
const testHttpStatus = commons.testHttpStatus;
const checkWriteRight = commons.checkWriteRight;
const mustachePlaceholder = commons.mustacheToShellVariable;
const contentDispositionFilename = commons.contentDispositionFilename;

module.exports = class Request {
  constructor(postman) {
    this.name = postman.name;
    this.postman = postman;

    this.headers = {};
    this.checks = {};
  }

  buildAuth() {
    if (this.postman.currentHelper === 'basicAuth') {
      this.auth = {
        type: 'basic',
        user: mustachePlaceholder(this.postman.helperAttributes.username),
        psw: mustachePlaceholder(this.postman.helperAttributes.password),
      };
    }
  }

  buildHeaders() {
    const self = this;

    function manageHeader(key, value) {
      if (!self.auth || self.auth && key !== 'Authorization') {
        self.headers[mustachePlaceholder(key)] = mustachePlaceholder(value);
      }
    }

    self.postman.headers.split(/\n/gmi).forEach(header => {
      if (header !== '') {
        splitHeader(header, manageHeader);
      }
    });
  }

  buildBody() {
    const self = this;

    if (self.postman.dataMode === 'raw') {
      self.body = {
        filename: `${safeFilename(self.name)}_stringbody.txt`,
        content: mustachePlaceholder(self.postman.rawModeData),
      };
    } else if (self.postman.dataMode === 'binary') {
      self.body = {
        filename: 'YOUR_FILENAME_HERE',
      };

      if (self.headers['Content-Disposition']) {
        contentDispositionFilename(self.headers['Content-Disposition'], filename => {
          self.body.filename = filename;
        });
      }
    }
  }

  buildChecks() {
    const self = this;

    self.checks.status = [];
    testHttpStatus(self.postman.tests, httpCode => {
      self.checks.status.push(httpCode);
    });
  }

  build() {
    this.method = mustachePlaceholder(this.postman.method.toLowerCase());
    this.url = mustachePlaceholder(this.postman.url);

    this.buildAuth();
    this.buildHeaders();
    this.buildBody();
    this.buildChecks();

    return this;
  }

  static generateIndexOffset(offset) {
    return [indent(offset), indent(offset + 1), indent(offset + 2)];
  }

  generateAuth(indentOffset) {
    if (this.auth) {
      if (this.auth.type === 'basic') {
        return `${indentOffset[1]}.basicAuth("${this.auth.user}", "${this.auth.psw}")\n`;
      }
      if (this.auth.type === 'digest') {
        return `${indentOffset[1]}.digest("${this.auth.user}", "${this.auth.psw}")\n`;
      }
    }
    return '';
  }

  generateHeaders(indentOffset) {
    let str = '';

    for (const key in this.headers) {
      if (Object.hasOwnProperty.call(this.headers, key)) {
        str += `${indentOffset[1]}.header("${key}", "${this.headers[key]}")\n`;
      }
    }

    return str;
  }

  generateBodies(indentOffset, outputName, bodiesPath) {
    let str = '';

    if (this.body) {
      const filename = `${outputName}/${this.body.filename}`;
      const requestBodyPath = bodiesPath + filename;
      let writePromise = undefined;

      if (this.body.content) {
        writePromise = writeFile(requestBodyPath, this.body.content);
        promises.add(writePromise);
      }

      str += `${indentOffset[1]}.body(RawFileBody("${filename}"))\n`;
      promises.add(new Promise(resolve => {
        if (writePromise) {
          writePromise.then(() => {
            checkWriteRight(requestBodyPath).then(resolve, () => {
              messages.add(`For request <${this.name}> : Please provide file ${requestBodyPath}`);
              resolve();
            });
          });
        } else {
          resolve();
        }
      }));
    }

    return str;
  }

  generateChecksStatus(indentOffset) {
    let str = '';

    const statusCount = this.checks.status.length;
    if (statusCount > 0) {
      str += `${indentOffset[2]}status.${statusCount === 1 ? 'is' : 'in'}(${this.checks.status.join(', ')})`;
    }

    return str;
  }

  generateChecks(indentOffset) {
    let str = '';

    const statuses = this.generateChecksStatus(indentOffset);

    if (statuses !== '') {
      str += `${indentOffset[1]}.check(\n`;
      str += statuses;
      str += `\n${indentOffset[1]})\n`;
    }

    return str;
  }

  generate(outputName, bodiesPath, offset) {
    let str = '';

    const indentOffset = Request.generateIndexOffset(offset);

    str += `${indentOffset[0]}.exec(http("${this.name}")\n`;
    str += `${indentOffset[1]}.${this.method}("${this.url}")\n`;

    str += this.generateAuth(indentOffset);
    str += this.generateHeaders(indentOffset);
    str += this.generateBodies(indentOffset, outputName, bodiesPath);
    str += this.generateChecks(indentOffset);

    str += `${indentOffset[0]})\n`;
    return str;
  }
};
