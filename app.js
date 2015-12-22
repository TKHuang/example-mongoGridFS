'use strict'
/**
 * Module dependencies.
 */

const serve = require('koa-static');
const koaBody = require('koa-body');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('koa-logger');
const Koa = require('koa');
const convert = require('koa-convert');
const debug = require('debug')('app');
const mongo = require('mongodb');
const Grid = require('gridfs-stream');

const app = new Koa();
const db = new mongo.Db(`GG`, new mongo.Server('127.0.0.1', 27017));

let gfs;
// log requests

db.open( err => {
  if (err) return console.log(err);
  gfs = Grid(db, mongo);
})

function writeFile(file) {
  return new Promise( (resolve, reject) => {
    let writeStream = gfs.createWriteStream({
      filename: file.name,
      content_type: file.type,
      mode: 'w'
    });

    writeStream
    .on('close', file => {
      debug(`on close`,file)
      resolve(file);
    })
    .on('error', err => {
      reject(err);
    })

    fs.createReadStream(file.path).pipe(writeStream);
  })
}

function readFile(_id) {
  return gfs.createReadStream({
    _id
  });
}

function accessFile(_id) {
  return new Promise( (resolve, reject) => {
    gfs.findOne({_id}, (err, file) => {
      if (err) return reject(err);
      resolve(file);
    })
  })
}
app.use(logger());
app.use(convert(koaBody({
  // formidable: {uploadDir: __dirname},
  multipart: true
})));
// custom 404

app.use(async (ctx, next) => {
  await next();
  if (ctx.body || !ctx.idempotent) return;
  ctx.redirect('/404.html');
});

// serve files from ./public
app.use(convert(serve(__dirname + '/public')));

// handle uploads


app.use(async (ctx, next) => {
  // ignore non-POSTs
  if ('POST' !== ctx.method) return await next();
  // multipart upload
  // debug(ctx.request.body)
  let parts = [].concat(ctx.request.body.files.file);

  let files = parts.map( file => {
    return writeFile(file);
  });

  await Promise.all(files)
  .then( files => {
    return files.map( file => {
      debug(`promise`, file)
      return file;
    })
  })
  .then( files => {
    debug(`then`, files)
    ctx.body = JSON.stringify(files, null, 2);
  })

  // ctx.redirect('/');
});

app.use(async (ctx, next) => {
  if('GET' !== ctx.method || '/download' !== ctx.path) return await next();

  await accessFile(ctx.query.file)
  .then( meta => {
    ctx.type = meta.contentType;
    ctx.length = meta.length;
    ctx.attachment(meta.filename);
    ctx.body = readFile(ctx.query.file);
  })
})

app.listen(3000);
console.log('listening on port 3000');
