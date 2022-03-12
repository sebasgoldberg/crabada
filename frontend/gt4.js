'v4.1.1 Geetest Inc.';
const uuid = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c)=>{
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    }
    );
};
window.uuid = uuid;
(function(window) {
    if (typeof window === 'undefined') {
        throw new Error('Geetest requires browser environment');
    }
    const {document} = window;
    const {Math} = window;
    const head = document.getElementsByTagName('head')[0];
    const TIMEOUT = 10000;
    function _Object(obj) {
        this._obj = obj;
    }
    _Object.prototype = {
        _each(process) {
            const {_obj} = this;
            for (const k in _obj) {
                if (_obj.hasOwnProperty(k)) {
                    process(k, _obj[k]);
                }
            }
            return this;
        },
        _extend(obj) {
            const self = this;
            new _Object(obj)._each((key,value)=>{
                self._obj[key] = value;
            }
            );
        },
    };
    function Config(config) {
        const self = this;
        new _Object(config)._each((key,value)=>{
            self[key] = value;
        }
        );
    }
    Config.prototype = {
        apiServers: ['gcaptcha4.geetest.com', 'gcaptcha4.geevisit.com'],
        staticServers: ['static.geetest.com', 'static.geevisit.com', 'dn-staticdown.qbox.me', ],
        protocol: 'http://',
        typePath: '/load',
        fallback_config: {
            bypass: {
                staticServers: ['static.geetest.com', 'static.geevisit.com', 'dn-staticdown.qbox.me', ],
                type: 'bypass',
                bypass: '/v4/bypass.js',
            },
        },
        _get_fallback_config() {
            const self = this;
            if (isString(self.type)) {
                return self.fallback_config[self.type];
            }
            return self.fallback_config.bypass;
        },
        _extend(obj) {
            const self = this;
            new _Object(obj)._each((key,value)=>{
                self[key] = value;
            }
            );
        },
    };
    const isNumber = function(value) {
        return typeof value === 'number';
    };
    var isString = function(value) {
        return typeof value === 'string';
    };
    const isBoolean = function(value) {
        return typeof value === 'boolean';
    };
    const isObject = function(value) {
        return typeof value === 'object' && value !== null;
    };
    const isFunction = function(value) {
        return typeof value === 'function';
    };
    const MOBILE = /Mobi/i.test(navigator.userAgent);
    const callbacks = {};
    const status = {};
    const random = function() {
        return parseInt(Math.random() * 10000) + new Date().valueOf();
    };
    const bind = function(target, context) {
        if (typeof target !== 'function') {
            return;
        }
        const args = Array.prototype.slice.call(arguments, 2);
        if (Function.prototype.bind) {
            return target.bind(context, args);
        }
        return function() {
            const _args = Array.prototype.slice.call(arguments);
            return target.apply(context, args.concat(_args));
        }
        ;
    };
    const {toString} = Object.prototype;
    const _isFunction = function(obj) {
        return typeof obj === 'function';
    };
    const _isObject = function(obj) {
        return obj === Object(obj);
    };
    const _isArray = function(obj) {
        return toString.call(obj) == '[object Array]';
    };
    const _isDate = function(obj) {
        return toString.call(obj) == '[object Date]';
    };
    const _isRegExp = function(obj) {
        return toString.call(obj) == '[object RegExp]';
    };
    const _isBoolean = function(obj) {
        return toString.call(obj) == '[object Boolean]';
    };
    function resolveKey(input) {
        return input.replace(/(\S)(_([a-zA-Z]))/g, (match,$1,$2,$3)=>{
            return $1 + $3.toUpperCase() || '';
        }
        );
    }
    function camelizeKeys(input, convert) {
        if (!_isObject(input) || _isDate(input) || _isRegExp(input) || _isBoolean(input) || _isFunction(input)) {
            return convert ? resolveKey(input) : input;
        }
        if (_isArray(input)) {
            var temp = [];
            for (let i = 0; i < input.length; i++) {
                temp.push(camelizeKeys(input[i]));
            }
        } else {
            var temp = {};
            for (const prop in input) {
                if (input.hasOwnProperty(prop)) {
                    temp[camelizeKeys(prop, true)] = camelizeKeys(input[prop]);
                }
            }
        }
        return temp;
    }
    const loadScript = function(url, cb, timeout) {
        const script = document.createElement('script');
        script.charset = 'UTF-8';
        script.async = true;
        if (/static\.geetest\.com/g.test(url)) {
            script.crossOrigin = 'anonymous';
        }
        script.onerror = function() {
            cb(true);
            loaded = true;
        }
        ;
        var loaded = false;
        script.onload = script.onreadystatechange = function() {
            if (!loaded && (!script.readyState || script.readyState === 'loaded' || script.readyState === 'complete')) {
                loaded = true;
                setTimeout(()=>{
                    cb(false);
                }
                , 0);
            }
        }
        ;
        script.src = url;
        head.appendChild(script);
        setTimeout(()=>{
            if (!loaded) {
                script.onerror = script.onload = null;
                script.remove && script.remove();
                cb(true);
            }
        }
        , timeout || TIMEOUT);
    };
    const normalizeDomain = function(domain) {
        return domain.replace(/^https?:\/\/|\/$/g, '');
    };
    const normalizePath = function(path) {
        path = path.replace(/\/+/g, '/');
        if (path.indexOf('/') !== 0) {
            path = `/${path}`;
        }
        return path;
    };
    const normalizeQuery = function(query) {
        if (!query) {
            return '';
        }
        let q = '?';
        new _Object(query)._each((key,value)=>{
            if (isString(value) || isNumber(value) || isBoolean(value)) {
                q = `${q + encodeURIComponent(key)}=${encodeURIComponent(value)}&`;
            }
        }
        );
        if (q === '?') {
            q = '';
        }
        return q.replace(/&$/, '');
    };
    const makeURL = function(protocol, domain, path, query) {
        domain = normalizeDomain(domain);
        let url = normalizePath(path) + normalizeQuery(query);
        if (domain) {
            url = protocol + domain + url;
        }
        return url;
    };
    const load = function(config, protocol, domains, path, query, cb, handleCb) {
        var tryRequest = function(at) {
            if (handleCb) {
                var cbName = `geetest_${random()}`;
                window[cbName] = bind(handleCb, null, cbName);
                query.callback = cbName;
            }
            const url = makeURL(protocol, domains[at], path, query);
            loadScript(url, (err)=>{
                if (err) {
                    if (cbName) {
                        try {
                            window[cbName] = function() {
                                window[cbName] = null;
                            }
                            ;
                        } catch (e) {}
                    }
                    if (at >= domains.length - 1) {
                        cb(true);
                    } else {
                        tryRequest(at + 1);
                    }
                } else {
                    cb(false);
                }
            }
            , config.timeout, );
        };
        tryRequest(0);
    };
    const jsonp = function(domains, path, config, callback) {
        const handleCb = function(cbName, data) {
            if (data.status == 'success') {
                callback(data.data);
            } else if (!data.status) {
                callback(data);
            } else {
                callback(data);
            }
            window[cbName] = undefined;
            try {
                delete window[cbName];
            } catch (e) {}
        };
        load(config, config.protocol, domains, path, {
            captcha_id: config.captchaId,
            challenge: config.challenge || uuid(),
            client_type: MOBILE ? 'h5' : 'web',
            risk_type: config.riskType,
            call_type: config.callType,
            lang: config.language ? config.language : navigator.appName === 'Netscape' ? navigator.language.toLowerCase() : navigator.userLanguage.toLowerCase(),
        }, (err)=>{
            if (err && typeof config.offlineCb === 'function') {
                config.offlineCb();
                return;
            }
            if (err) {
                callback(config._get_fallback_config());
            }
        }
        , handleCb, );
    };
    const reportError = function(config, url) {
        load(config, config.protocol, ['monitor.geetest.com'], '/monitor/send', {
            time: Date.now().getTime(),
            captcha_id: config.gt,
            challenge: config.challenge,
            exception_url: url,
            error_code: config.error_code,
        }, (err)=>{}
        , );
    };
    const throwError = function(errorType, config, errObj) {
        const errors = {
            networkError: '网络错误',
            gtTypeError: 'gt字段不是字符串类型',
        };
        if (typeof config.onError === 'function') {
            config.onError({
                desc: errObj.desc,
                msg: errObj.msg,
                code: errObj.code,
            });
        } else {
            throw new Error(errors[errorType]);
        }
    };
    const detect = function() {
        return window.Geetest || document.getElementById('gt_lib');
    };
    if (detect()) {
        status.slide = 'loaded';
    }
    window.initGeetest4 = function(userConfig, callback) {
        const config = new Config(userConfig);
        if (userConfig.https) {
            config.protocol = 'https://';
        } else if (!userConfig.protocol) {
            config.protocol = `${window.location.protocol}//`;
        }
        if (isObject(userConfig.getType)) {
            config._extend(userConfig.getType);
        }
        jsonp(config.apiServers, config.typePath, config, (newConfig)=>{
            var newConfig = camelizeKeys(newConfig);
            if (newConfig.status === 'error') {
                return throwError('networkError', config, newConfig);
            }
            const {type} = newConfig;
            if (config.debug) {
                new _Object(newConfig)._extend(config.debug);
            }
            const init = function() {
                config._extend(newConfig);
                callback(new window.Geetest4(config));
            };
            callbacks[type] = callbacks[type] || [];
            const s = status[type] || 'init';
            if (s === 'init') {
                status[type] = 'loading';
                callbacks[type].push(init);
                if (newConfig.gctPath) {
                    load(config, config.protocol, Object.hasOwnProperty.call(config, 'staticServers') ? config.staticServers : newConfig.staticServers || config.staticServers, newConfig.gctPath, null, (err)=>{
                        if (err) {
                            throwError('networkError', config, {
                                code: '60205',
                                msg: 'Network failure',
                                desc: {
                                    detail: 'gct resource load timeout',
                                },
                            });
                        }
                    }
                    , );
                }
                load(config, config.protocol, Object.hasOwnProperty.call(config, 'staticServers') ? config.staticServers : newConfig.staticServers || config.staticServers, newConfig.bypass || newConfig.staticPath + newConfig.js, null, (err)=>{
                    if (err) {
                        status[type] = 'fail';
                        throwError('networkError', config, {
                            code: '60204',
                            msg: 'Network failure',
                            desc: {
                                detail: 'js resource load timeout',
                            },
                        });
                    } else {
                        status[type] = 'loaded';
                        const cbs = callbacks[type];
                        for (let i = 0, len = cbs.length; i < len; i += 1) {
                            const cb = cbs[i];
                            if (isFunction(cb)) {
                                cb();
                            }
                        }
                        callbacks[type] = [];
                    }
                }
                , );
            } else if (s === 'loaded') {
                return init();
            } else if (s === 'fail') {
                throwError('networkError', config, {
                    code: '60204',
                    msg: 'Network failure',
                    desc: {
                        detail: 'js resource load timeout',
                    },
                });
            } else if (s === 'loading') {
                callbacks[type].push(init);
            }
        }
        );
    }
    ;
}(window));
