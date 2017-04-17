const fs = require('fs');
const writeFile = require('js-utils').asyncifyCallback(fs.writeFile);
const messages = require('./messages');
const promises = require('./promises');
const commons = require('./commons');

const indent = commons.indent;
const splitHeader = commons.splitHeader;
const escapeRegexString = commons.escapeRegexString;
const safeFilename = commons.safeFilename;
const testHttpStatus = commons.testHttpStatus;
const testBodyString = commons.testBodyString;
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
      if (!self.auth || (self.auth && key !== 'Authorization')) {
        self.headers[mustachePlaceholder(key)] = mustachePlaceholder(value);
      }
    }

    self.postman.headers.split(/\n/gmi).forEach((header) => {
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
        contentDispositionFilename(self.headers['Content-Disposition'], (filename) => {
          self.body.filename = filename;
        });
      }
    }
  }

  buildChecksStatus() {
    const self = this;

    self.checks.status = [];
    self.checks.notStatus = [];
    testHttpStatus(self.postman.tests, (inverse, httpCode) => {
      if (inverse) {
        self.checks.notStatus.push(httpCode);
      } else {
        self.checks.status.push(httpCode);
      }
    });
  }

  buildChecksBodies() {
    const self = this;

    self.checks.bodiesHas = [];
    testBodyString(self.postman.tests, (bodyString) => {
      self.checks.bodiesHas.push(bodyString.replace(/([$^.()[]\])/gmi, '\\1'));
    });
  }

  buildChecks() {
    this.buildChecksStatus();
    this.buildChecksBodies();
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
    const str = [];

    Object.keys(this.headers).map(
      key => `${indentOffset[1]}.header("${key}", "${this.headers[key]}")`,
    );

    return str.join('\n');
  }

  generateBodies(indentOffset, outputName, bodiesPath) {
    let str = '';

    if (this.body) {
      const filename = `${outputName}/${this.body.filename}`;
      const requestBodyPath = bodiesPath + filename;
      let writePromise;

      if (this.body.content) {
        writePromise = writeFile(requestBodyPath, this.body.content);
        promises.add(writePromise);
      }

      str += `${indentOffset[1]}.body(RawFileBody("${filename}"))\n`;
      promises.add(
        new Promise((resolve) => {
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
        }),
      );
    }

    return str;
  }

  generateChecksStatus(indentOffset) {
    const statuses = [];

    const statusCount = this.checks.status.length;
    if (statusCount > 0) {
      statuses.push(
        `${indentOffset[2]}status.${statusCount === 1 ? 'is' : 'in'}(${this.checks.status.join(', ')})`,
      );
    }

    this.checks.notStatus.forEach(httpStatus =>
      statuses.push(`${indentOffset[2]}status.not(${httpStatus})`),
    );

    return `${statuses.join(',\n')}\n`;
  }

  generateChecksBodies(indentOffset) {
    const statuses = [];

    this.checks.bodiesHas.forEach((bodyHas) => {
      statuses.push(`${indentOffset[2]}regex("${escapeRegexString(bodyHas)}")`);
    });

    return `${statuses.join(',\n')}\n`;
  }

  generateChecks(indentOffset) {
    let str = '';

    const statuses = this.generateChecksStatus(indentOffset);
    const bodies = this.generateChecksBodies(indentOffset);

    if (statuses.trim() !== '' || bodies.trim() !== '') {
      str += `${indentOffset[1]}.check(\n`;
      str += statuses.trim() !== '' ? statuses : '';
      str += bodies.trim() !== '' ? bodies : '';
      str += `${indentOffset[1]})\n`;
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
