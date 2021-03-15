import is from '@sindresorhus/is';
import type {URL} from 'url';
import type Options from './options';
import type {Timings} from '@szmarczak/http-timer';
import type {TimeoutError as TimedOutTimeoutError} from './utils/timed-out';
import type Request from '.';
import type {Response} from './response';

type Error = NodeJS.ErrnoException;

// A hacky check to prevent circullar references.
function isRequest(x: any): x is Request {
	return '_onResponse' in x;
}

/**
An error to be thrown when a request fails.
Contains a `code` property with error class code, like `ECONNREFUSED`.
*/
export class RequestError extends Error {
	code?: string;
	stack!: string;
	declare readonly options: Options;
	readonly response?: Response;
	readonly request?: Request;
	readonly timings?: Timings;

	constructor(message: string, error: Partial<Error & {code?: string}>, self: Request | Options) {
		super(message);
		Error.captureStackTrace(this, this.constructor);

		this.name = 'RequestError';
		this.code = error.code;

		// A hacky comparison to avoid cirrcular references
		if (isRequest(self)) {
			Object.defineProperty(this, 'request', {
				enumerable: false,
				value: self
			});

			Object.defineProperty(this, 'response', {
				enumerable: false,
				value: self.response
			});

			Object.defineProperty(this, 'options', {
				// This fails because of TS 3.7.2 useDefineForClassFields
				// Ref: https://github.com/microsoft/TypeScript/issues/34972
				enumerable: false,
				value: self.options
			});
		} else {
			Object.defineProperty(this, 'options', {
				// This fails because of TS 3.7.2 useDefineForClassFields
				// Ref: https://github.com/microsoft/TypeScript/issues/34972
				enumerable: false,
				value: self
			});
		}

		this.timings = this.request?.timings;

		// Recover the original stacktrace
		if (is.string(error.stack) && is.string(this.stack)) {
			const indexOfMessage = this.stack.indexOf(this.message) + this.message.length;
			const thisStackTrace = this.stack.slice(indexOfMessage).split('\n').reverse();
			const errorStackTrace = error.stack.slice(error.stack.indexOf(error.message!) + error.message!.length).split('\n').reverse();

			// Remove duplicated traces
			while (errorStackTrace.length > 0 && errorStackTrace[0] === thisStackTrace[0]) {
				thisStackTrace.shift();
			}

			this.stack = `${this.stack.slice(0, indexOfMessage)}${thisStackTrace.reverse().join('\n')}${errorStackTrace.reverse().join('\n')}`;
		}
	}
}

/**
An error to be thrown when the server redirects you more than ten times.
Includes a `response` property.
*/
export class MaxRedirectsError extends RequestError {
	declare readonly response: Response;
	declare readonly request: Request;
	declare readonly timings: Timings;

	constructor(request: Request) {
		super(`Redirected ${request.options.maxRedirects} times. Aborting.`, {}, request);
		this.name = 'MaxRedirectsError';
	}
}

/**
An error to be thrown when the server response code is not 2xx nor 3xx if `options.followRedirect` is `true`, but always except for 304.
Includes a `response` property.
*/
export class HTTPError extends RequestError {
	declare readonly response: Response;
	declare readonly request: Request;
	declare readonly timings: Timings;

	constructor(response: Response) {
		super(`Response code ${response.statusCode} (${response.statusMessage!})`, {}, response.request);
		this.name = 'HTTPError';
	}
}
/**
An error to be thrown when a cache method fails.
For example, if the database goes down or there's a filesystem error.
*/
export class CacheError extends RequestError {
	declare readonly request: Request;

	constructor(error: Error, request: Request) {
		super(error.message, error, request);
		this.name = 'CacheError';
	}
}

/**
An error to be thrown when the request body is a stream and an error occurs while reading from that stream.
*/
export class UploadError extends RequestError {
	declare readonly request: Request;

	constructor(error: Error, request: Request) {
		super(error.message, error, request);
		this.name = 'UploadError';
	}
}

/**
An error to be thrown when the request is aborted due to a timeout.
Includes an `event` and `timings` property.
*/
export class TimeoutError extends RequestError {
	declare readonly request: Request;
	readonly timings: Timings;
	readonly event: string;

	constructor(error: TimedOutTimeoutError, timings: Timings, request: Request) {
		super(error.message, error, request);
		this.name = 'TimeoutError';
		this.event = error.event;
		this.timings = timings;
	}
}

/**
An error to be thrown when reading from response stream fails.
*/
export class ReadError extends RequestError {
	declare readonly request: Request;
	declare readonly response: Response;
	declare readonly timings: Timings;

	constructor(error: Error, request: Request) {
		super(error.message, error, request);
		this.name = 'ReadError';
	}
}

/**
An error to be thrown when given an unsupported protocol.
*/
export class UnsupportedProtocolError extends RequestError {
	constructor(options: Options) {
		super(`Unsupported protocol "${(options.url as URL).protocol}"`, {}, options);
		this.name = 'UnsupportedProtocolError';
	}
}
