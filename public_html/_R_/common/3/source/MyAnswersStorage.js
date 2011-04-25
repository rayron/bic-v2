/*
 * custom library to abstract access to available local storage mechanisms
 * requires: jQuery 1.5+
 * 
 * valid storage types are: localstorage, sessionstorage, websqldatabase, indexeddb
 * 
 * This has been designed with seemless operation of asynchronous storage methods,
 * via the jQuery Deferred Promises mechanism in jQuery 1.5.
 * 
 * The mechanism-specific terms "database" and "table" have been replaced with
 * the more neutral "partition" and "section", respectively.
 */

// TODO: re-implement using jQuery promises

(function(window, $, undefined) {
	window.MyAnswersStorage = function(type, partition, section) {
		var isReady = false,
			readyDeferred = new $.Deferred(),
			db, // for websqldatabase, localstorage or sessionstorage
			memory; // for memory
		if (typeof partition !== 'string' || partition.length < 1) {
			partition = 'default';
		}
		if (typeof section !== 'string' || section.length < 1) {
			section = 'main';
		}
		
		if (typeof type !== 'string') {
			type = available[0];
		} else if (!$.inArray(type, available)) {
			type = available[0];
		}
		
		this.type = type;
		this.partition = partition;
		this.section = section;
		
		readyDeferred.done(function() {
			log('MyAnswersStorage(): ' + type + ' -> ' + partition + ' : ' + section + ' ready');
		});
		this.ready = function() {
			return readyDeferred.promise();
		};
		
		if (type === 'localstorage' || type === 'sessionstorage') {

			db = (type === 'localstorage') ? localStorage : sessionStorage;

			this.get = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					dfrd.resolve(db.getItem(partition + ':' + section + ':' + key));
					// dfrd.reject(); not sure if this is needed
				});
				return deferred.promise();
			};
			
			this.set = function(key, value) {
				var deferred = new $.Deferred(function(dfrd) {
					db.setItem(partition + ':' + section + ':' + key, value);
					dfrd.resolve();
				});
				return deferred.promise();
			};
			
			this.remove = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					db.removeItem(partition + ':' + section + ':' + key);
					dfrd.resolve();
				});
				return deferred.promise();
			};

			this.keys = function() {
				var deferred = new $.Deferred(function(dfrd) {
					var found = [],
						length = db.length,
						index, parts;
					for (index = 0; index < length; index++) {
						parts = db.key(index).split(':');
						if (parts[0] === partition && parts[1] === section) {
							found.push(parts[2]);
						}
					}
					dfrd.resolve(found);
				});
				return deferred.promise();
			};
			
			this.size = function() {
				var deferred = new $.Deferred(function(dfrd) {
					$.when(this.keys()).done(function(keys) {
						dfrd.resolve(keys.length);
					});
				});
				return deferred.promise();
			};
			
			readyDeferred.resolve();

		} else if (type === 'websqldatabase') {
			
			var successHandler = typeof $ === 'function' ? $.noop : function () { };
			var errorHandler = function (tx, error) {
				log('MyAnswersStorage error:', arguments);
			};
			
			try {
				db = openDatabase(partition, '1.0', partition, parseInt(32e3, 16));
			} catch(error) {
				throw 'MyAnswersStorage: ' + error;
			}
			
			db.transaction(function(tx) {
				tx.executeSql(
					'CREATE TABLE IF NOT EXISTS ' + section + ' (k TEXT UNIQUE NOT NULL PRIMARY KEY, v TEXT NOT NULL)',
					[],
					readyDeferred.resolve,
					readyDeferred.reject
				);
			}, errorHandler, successHandler);
			
			this.get = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					db.readTransaction(function(tx) {
						tx.executeSql(
							'SELECT v FROM ' + section + ' WHERE k = ?', [ key ], function(tx, result) {
								if (result.rows.length === 1) {
									dfrd.resolve(result.rows.item(0).v);
								} else {
									dfrd.resolve(null);
									if (result.rows.length > 1) {
										throw('MyAnswersStorage: non-unique key');
									}
								}
							}
						);
					}, errorHandler, successHandler);
				});
				return deferred.promise();
			};
			
			this.set = function(key, value) {
				var deferred = new $.Deferred(function(dfrd) {
					db.transaction(function(tx) {
						tx.executeSql('DELETE FROM ' + section + ' WHERE k = ?', [ key ]);
						tx.executeSql(
							'INSERT INTO ' + section + ' (k, v) VALUES (?, ?)', [ key, value ], function(tx, result) {
								if (result.rowsAffected !== 1) {
									dfrd.reject();
									throw('MyAnswersStorage: failed INSERT');
								}
								dfrd.resolve();
							}
						);
					}, errorHandler, successHandler);
				});
				return deferred.promise();
			};
			
			this.remove = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					db.transaction(function(tx) {
						tx.executeSql('DELETE FROM `' + section + '` WHERE k = ?', [ key ], function(tx, result) {
							dfrd.resolve();
						});
					}, errorHandler, successHandler);
				});
				return deferred.promise();
			};

			this.keys = function() {
				var deferred = new $.Deferred(function(dfrd) {
					db.readTransaction(function(tx) {
						tx.executeSql('SELECT k FROM ' + section, [], function(tx, result) {
							var index, row,
								length = result.rows.length,
								found = [];
							for (index = 0; index < length; index++) {
								row = result.rows.item(index);
								found.push(row.k);
							}
							dfrd.resolve(found);
						});
					}, errorHandler, successHandler);
				});
				return deferred.promise();
			};
			
			this.size = function() {
				var deferred = new $.Deferred(function(dfrd) {
					db.readTransaction(function(tx) {
						tx.executeSql(
							'SELECT k FROM ' + section, [], function(tx, result) {
								dfrd.resolve(result.rows.length);
							}
						);
					}, errorHandler, successHandler);
				});
				return deferred.promise();
			};
			
		} else if (type === 'memory') {
			
			this.memory = {};

			this.get = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					dfrd.resolve(this.memory[partition + ':' + section + ':' + key]);
					// dfrd.reject(); not sure if this is needed
				});
				return deferred.promise();
			};
			
			this.set = function(key, value) {
				var deferred = new $.Deferred(function(dfrd) {
					this.memory[partition + ':' + section + ':' + key] = value;
					dfrd.resolve();
				});
				return deferred.promise();
			};
			
			this.remove = function(key) {
				var deferred = new $.Deferred(function(dfrd) {
					delete this.memory[partition + ':' + section + ':' + key];
					dfrd.resolve();
				});
				return deferred.promise();
			};

			this.keys = function() {
				var deferred = new $.Deferred(function(dfrd) {
					var found = [],
						key, parts;
					for (key in this.memory) {
						if (this.memory.hasOwnProperty(key)) {
							parts = this.memory[key].split(':');
							if (parts[0] === partition && parts[1] === section) {
								found.push(parts[2]);
							}
						}
					}
					dfrd.resolve(found);
				});
				return deferred.promise();
			};
			
			this.size = function() {
				var deferred = new $.Deferred(function(dfrd) {
					$.when(this.keys()).done(function(keys) {
						dfrd.resolve(keys.length);
					});
				});
				return deferred.promise();
			};
			
			readyDeferred.resolve();
		}
		return this;
	};
	window.MyAnswersStorage.prototype.log = function() {
		if (typeof console !== 'undefined') { console.log.apply(console, arguments); }
		else if (typeof debug !== 'undefined') { debug.log.apply(debug, arguments); }
	}; 
	window.MyAnswersStorage.prototype.available = [];
	var available = window.MyAnswersStorage.prototype.available,
		log = window.MyAnswersStorage.prototype.log;
	// TODO: add detection for indexedDB
	if (typeof window.openDatabase !== 'undefined') {
		available.push('websqldatabase');
	}
	if (typeof window.localStorage !== 'undefined') {
		available.push('localstorage');
	}
	if (typeof window.sessionStorage !== 'undefined') {
		available.push('sessionstorage');
	}
	available.push('memory');
	log('MyAnswersStorage(): available=[' + available.join(',') + ']');
}(this, this.jQuery));
