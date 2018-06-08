"use strict";
const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const yaml = require('js-yaml');
const { parseSchema } = require('@numminorihsf/json-schema-to-flow-type');

const { Client } = require('node-rest-client');

const {
  API_SPEC_URL,
  DEST = './dto-spec'
} = process.env;


new Promise(getApiSpec)
  .then(yamlToJson)
  .then(camelizeJSON)
  .then(transformTypeDefsToConvention)
  .then(yamlToJson)
  .then(jsonToTypes);

function getApiSpec(resolve) {
  const client = new Client();

  return client.get(API_SPEC_URL, function (data) {
    return resolve({ text: data.toString() });
  });
}

function yamlToJson({ text }) {
  return Promise.resolve({ text, json: yaml.safeLoad(text) });
}

function camelizeJSON({ text, json }) {
  return Promise.resolve({ text, json })
}

function transformTypeDefsToConvention({ text: oldText, json }) {
  const text = Object.keys(json.definitions).reduce((currentText, tid) => {
    const id = _.upperFirst(_.camelCase(tid));

    return currentText.split('\n').map(
      line => line.split(' ').map(word => {
        if (word === id) return `${id}Dto`;
        if (word === tid) return `${id}Dto`;
        if (word === `${id}:`) return `${id}Dto:`;
        if (word === `${tid}:`) return `${id}Dto:`;
        if (word === `'#/definitions/${id}'`) return `'#/definitions/${id}Dto'`;
        if (word === `'#/definitions/${tid}'`) return `'#/definitions/${id}Dto'`;

        return word;
      }).join(' ')
    ).join('\n');
  }, oldText);

  return Promise.resolve({ json, text });
}

function jsonToTypes({ json }) {
  const paths = {};

  try {
    fs.mkdirSync(DEST);
  } catch(e) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
  }

  function getRealName(name) {
    const lowerName = name.toLowerCase();

    return Object.keys(paths).find(pathName => pathName.toLowerCase() === lowerName) || name;
  }

  Object.keys(json.definitions)
    .map(prevId => {
      const id = _.upperFirst(_.camelCase(prevId));

      paths[id] = `./${id}.js.flow`;

      return id;
    })
    .map(id => {
      const schemaToParse = Object.assign({ id }, json.definitions[id]);
      const flowCode = parseSchema(schemaToParse).split('\b').join('');

      const imports = getDtosFromFile(flowCode, id).map(getRealName);
      const importLines = imports.map(name => `import type { ${name} } from '${paths[name]}';`).join('\n');

      return {
        id,
        content: [
        '// @flow',
          `${importLines}\n`,
          flowCode
        ].filter(val => val.trim()).join('\n')
      };
    })
    .forEach(({ id, content }) => {
      const filepath = path.join(DEST, paths[id]);

      fs.writeFile(filepath, content, error => {
        if (error) {
          throw error;
        }

        // console.log(`Wrote ${filepath}`);
      });
    });
}

function getDtosFromFile(content, id) {
  return content.split(/\b/).filter(word => word.endsWith('Dto')).filter(name => name !== id);
}
