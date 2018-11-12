const request = require('daap-request');
const noCache = ['/ctrl-int/1/nowplayingartwork'];
const noLogin = ['/content-codes', '/server-info', '/login'];
const fnMap = {
	serverInfo: '/server-info',
	contentCodes: '/content-codes',
	login: '/login',
	logout: '/logout',
	getSpeakers: '/ctrl-int/1/getspeakers',
	setSpeakers: '/ctrl-int/1/setspeakers',
	nowPlayingArtwork: '/ctrl-int/1/nowplayingartwork',
	prevItem: '/ctrl-int/1/previtem',
	nextItem: '/ctrl-int/1/nextitem'
};

class DAAP {
	constructor(options = {}) {
		this._pending = {};
		this._host = options.host;
		this._port = options.port || 3689;
		this.remoteId = options.remoteId;
		this.guId = options.guId;
	}
	request(path, query = {}, retry = true) {
		if(noLogin.includes(path) || query['session-id']) {
			const headers = {};

			if (path === fnMap.login && this.guId) {
				query['pairing-guid'] = this.guId;
			}
			if (this.remoteId) {
				headers['Active-Remote'] = this.remoteId;
			} else {
				headers['Viewer-Only-Client'] = 1;
			}

			return this._requestFromCache(path, query, headers).catch((e) => {
				if (retry && query['session-id']) {
					delete query['session-id'];
					return this.request(path, query, false);
				}
				throw e;
			});
		}

		if (path === fnMap.logout && (!this._pending[fnMap.login] || !Object.keys(this._pending[fnMap.login]).length)) {
			return new Promise((res, rej) => rej({}));
		}
		return this.login().then(([mlog]) => {
			query['session-id'] = mlog.mlid;
			return this.request(path, query, retry);
		});
	}
	_requestFromCache(path, query, headers) {
		const queryHash = JSON.stringify(query);
		let req;

		if (!this._pending[path]) {
			this._pending[path] = {}
		}

		req = this._pending[path][queryHash];

		if (!req) {
			req = request({
				host: this._host,
				port: this._port,
				path,
				query,
				headers
			})
			.then(res => {
				// leave login promise in cache
				if (path !== fnMap.login) {
					delete this._pending[path][queryHash];
				}
				// until logout
				if (path === fnMap.logout) {
					delete this._pending[fnMap.login];
				}
				return res;
			})
			.catch(res => {
				const [{ mstt }] = res;
				if (mstt === 401 || mstt === 403) {
					delete this._pending[fnMap.login];
				}
				delete this._pending[path][queryHash];
				throw res;
			});

			if (!noCache.includes(path)) {
				this._pending[path][queryHash] = req;
			}
		}
		return req;
	}
};

Object.keys(fnMap).forEach(fn => {
	DAAP.prototype[fn] = function (query) {
		return this.request(fnMap[fn], query);
	};
});

module.exports = DAAP;
