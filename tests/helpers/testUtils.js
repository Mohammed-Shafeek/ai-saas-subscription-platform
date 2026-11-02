/**
 * Lightweight in-memory HTTP request and response mocks for testing Express controllers
 * without requiring ephemeral TCP network sockets or triggering sandbox EACCES errors.
 */

const createMockReq = ({
  method = 'GET',
  url = '/',
  params = {},
  query = {},
  body = {},
  headers = {},
  user = null,
  rawBody = null
} = {}) => {
  return {
    method,
    url,
    originalUrl: url,
    params,
    query,
    body,
    headers: { ...headers },
    user,
    rawBody: rawBody || Buffer.from(JSON.stringify(body))
  };
};

const createMockRes = () => {
  let onFinish;
  const finishPromise = new Promise((resolve) => {
    onFinish = resolve;
  });

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    downloadPath: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      onFinish(this);
      return this;
    },
    send(data) {
      this.body = data;
      onFinish(this);
      return this;
    },
    download(filePath, fileName) {
      this.downloadPath = filePath;
      this.downloadName = fileName;
      this.headers['content-type'] = 'application/pdf';
      this.headers['content-disposition'] = `attachment; filename="${fileName}"`;
      onFinish(this);
      return this;
    },
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    waitForFinish: () => finishPromise
  };
  return res;
};

const executeRoute = async (middlewareChain, req, res) => {
  for (const fn of middlewareChain) {
    let nextError = null;

    await new Promise((resolve) => {
      let resolved = false;
      const done = (err) => {
        if (!resolved) {
          resolved = true;
          if (err) nextError = err;
          resolve();
        }
      };

      res.waitForFinish().then(() => done());

      try {
        const result = fn(req, res, (err) => done(err));
        if (result && typeof result.catch === 'function') {
          result.catch((err) => done(err));
        }
      } catch (err) {
        done(err);
      }
    });

    if (nextError) {
      res.statusCode = nextError.statusCode || 500;
      res.body = {
        success: false,
        error: nextError.message,
        ...(nextError.details ? { details: nextError.details } : {})
      };
      return res;
    }

    if (res.body !== null || res.downloadPath !== null) {
      return res;
    }
  }

  return res;
};

module.exports = {
  createMockReq,
  createMockRes,
  executeRoute
};
