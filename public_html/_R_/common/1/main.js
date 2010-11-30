var
locationTracker, latitude, longitude, webappCache,

hasCategories, hasMasterCategories, hasVisualCategories, answerSpaceOneKeyword,

currentKeyword, currentCategory, currentMasterCategory,

siteConfig, siteConfigHash,
starsProfile,
answerSpacesList, answerSpacesHash,
backStack,

lowestTransferRateConst, maxTransactionTimeout,
ajaxQueue, ajaxQueueMoJO;

function PictureSourceType() {}
function lastPictureTaken () {}

// *** BEGIN UTILS ***

MyAnswers.log = function(msgStr) {
	if (window.console !== undefined) {	console.log(msgStr); }
	else if (window.debug !== undefined) { debug.log(msgStr); }
};

function isCameraPresent() {
  MyAnswers.log("isCameraPresent: " + window.device.camerapresent);
  return MyAnswers.cameraPresent;
}

function addEvent(obj, evType, fn) { 
  if (obj.addEventListener) { 
    obj.addEventListener(evType, fn, false); 
    return true; 
  } else if (obj.attachEvent) { 
    var r = obj.attachEvent("on"+evType, fn); 
    return r; 
  } else { 
    return false; 
  } 
}

function computeTimeout(messageLength) {
  var t = (messageLength * lowestTransferRateConst) + 5000;
  return ((t < maxTransactionTimeout) ? t : maxTransactionTimeout);
}

function setAnswerSpaceItem(key, value)
{
	if (deviceVars.storageReady) { jStore.set(key, value); }
}

function getAnswerSpaceItem(key)
{
	return deviceVars.storageReady ? jStore.get(key) : null;
}

function removeAnswerSpaceItem(key)
{
	if (deviceVars.storageReady) { jStore.remove(key); }
}

// convert 'argument=value&args[0]=value1&args[1]=value2' into '{"argument":"value","args[0]":"value1","args[1]":"value2"}'
function deserialize(argsString)
{
	var args = argsString.split('&');
	var result = { };
	for (var a in args)
	{
		if (args.hasOwnProperty(a))
		{
			var terms = args[a].split('=');
			if (terms[0].length > 0)
			{
				result[decodeURIComponent(terms[0])] = decodeURIComponent(terms[1]);
			}
		}
	}
	return result;
}

function emptyDOMelement(element)
{
	if ($.type(element) === 'object')
	{
		while (element.hasChildNodes()) { element.removeChild(element.lastChild); }
	}
}

function insertHTML(element, html)
{
	if ($.type(element) === 'object')
	{
		emptyDOMelement(element);
		$(element).append(html);
	}
}

function insertText(element, text)
{
	if ($.type(element) === 'object')
	{
		emptyDOMelement(element);
		element.appendChild(document.createTextNode(text));
	}
}

function setMainLabel(label)
{
	var mainLabel = document.getElementById('mainLabel');
	insertText(mainLabel, label);
}

function getURLParameters()
{
	var queryString = window.location.href.split('?')[1].split('#')[0];
	if (typeof(queryString) === 'string')
	{
		var parameters = deserialize(queryString);
		if (typeof(parameters.keyword) == 'string')
		{
			parameters.keyword = parameters.keyword.replace('/', '');
		}
		return parameters;
	}
	else
	{
		return [];
	}
}

function isAJAXError(status)
{
	switch(status) {
		case null:
		case 'timeout':
		case 'error':
		case 'notmodified':
		case 'parseerror':
			return true;
		default:
			return false;
	}
}

function populateDataTags(element, data)
{
	if ($.type(element) !== 'object') { return null; }
	for (var d in data)
	{
		if (data.hasOwnProperty(d))
		{
			element.setAttribute('data-' + d, data[d]);
		}
	}
}

// jStore doesn't do this for us, so this function will empty client-side storage
function clearStorage()
{
	var storageType = jStore.activeEngine().flavor;
	MyAnswers.log('clearStorage: ' + storageType);
	switch (storageType)
	{
		case 'jstore-html5-sql':
			jStore.activeEngine().database.transaction(function (database) {
				database.executeSql('TRUNCATE TABLE jstore');
			});
			break;
		case 'jstore-html5-local':
			window.localStorage.clear();
			break;
		case 'jstore-flash':
			break;
		case 'jstore-msie':
			break;
		case 'jstore-google-gears':
			break;
		default:
			MyAnswers.log('unidentified jStore engine');
	}
}

function parseXMLElements(xmlString)
{
	var xml;
	if (typeof(window.DOMParser) === 'function' || typeof(window.DOMParser) === 'object')
	{
		var domParser = new DOMParser();
		xml = domParser.parseFromString(xmlString, 'application/xml');
		MyAnswers.log('string parsed to XML using W3C DOMParser()', xml);
	}
	else if (typeof(xmlParse) === 'function')
	{
		xml = xmlParse(xmlString);
		MyAnswers.log('string parsed to XML using AJAXSLT library', xml);
	}
	else
	{
		var url = "data:text/xml;charset=utf-8," + encodeURIComponent(xmlString);
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, false);
		xhr.send(null);
		xml = xhr.responseXML;
		MyAnswers.log('string parsed to XML using fake AJAX query', xml);
	}
	return xml;
}

function processBlinkAnswerMessage(message)
{
	message = JSON.parse(message);
	MyAnswers.log(message);
	if (typeof(message.loginStatus) == 'string' && typeof(message.loginKeyword) == 'string' && typeof(message.logoutKeyword) == 'string') {
		MyAnswers.log('blinkAnswerMessage: loginStatus detected');
		if (message.loginStatus == "LOGGED IN") {
			$('#loginButton').addClass('hidden');
			$('#logoutButton').removeAttr('onclick').unbind('click').removeClass('hidden');
			$('#logoutButton').bind('click', function() {
				gotoNextScreen(message.logoutKeyword);
			});
		} else { // LOGGED OUT
			$('#logoutButton').addClass('hidden');
			$('#loginButton').removeAttr('onclick').unbind('click').removeClass('hidden');
			$('#loginButton').bind('click', function() {
				gotoNextScreen(message.loginKeyword);
			});
		}
	}
}

function runListWithDelay(taskList, delay, callback) {
	var ttt = taskList.concat();
	if (typeof(callback) !== 'function')
	{
		throw("runListWithDelay: callback not a function");
	}
	setTimeout(function() {
		var tt = ttt.shift();
		var result;
		try {
			result = tt.apply(null, null);
		} catch(e) {
			MyAnswers.log("runListWithDelay: Exception");
			MyAnswers.log(e);
			MyAnswers.log(tt);
		}
		//MyAnswers.log("runListWithDelay: " + result + "[" + delay +"]");
		if (ttt.length > 0 && result) {
			setTimeout(arguments.callee, delay);
		} else {
			callback();
		}
	}, delay);
}

// MIT/GPL from http://phpjs.org/functions/parse_url:485 version 1009.2513
// note: Does not replace invalid characters with '_' as in PHP, nor does it return false for bad URLs
// example 1: parse_url('http://username:password@hostname/path?arg=value#anchor');
// returns 1: {scheme: 'http', host: 'hostname', user: 'username', pass: 'password', path: '/path', query: 'arg=value', fragment: 'anchor'}
function parse_url (str, component) {
	var o = {
		strictMode: false,
		key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
		q: {
			name: "queryKey",
			parser: /(?:^|&)([^&=]*)=?([^&]*)/g
		},
		parser: {
			strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
			loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/\/?)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/ // Added one optional slash to post-protocol to catch file:/// (should restrict this)
		}
	};
	var m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
	uri = {},
	i = 14;
	while (i--) { uri[o.key[i]] = m[i] || ""; }
	switch (component) {
		case 'PHP_URL_SCHEME':
			return uri.protocol;
		case 'PHP_URL_HOST':
			return uri.host;
		case 'PHP_URL_PORT':
			return uri.port;
		case 'PHP_URL_USER':
			return uri.user;
		case 'PHP_URL_PASS':
			return uri.password;
		case 'PHP_URL_PATH':
			return uri.path;
		case 'PHP_URL_QUERY':
			return uri.query;
		case 'PHP_URL_FRAGMENT':
			return uri.anchor;
		default:
			var retArr = {};
			if (uri.protocol !== '') {retArr.scheme=uri.protocol;}
			if (uri.host !== '') {retArr.host=uri.host;}
			if (uri.port !== '') {retArr.port=uri.port;}
			if (uri.user !== '') {retArr.user=uri.user;}
			if (uri.password !== '') {retArr.pass=uri.password;}
			if (uri.path !== '') {retArr.path=uri.path;}
			if (uri.query !== '') {retArr.query=uri.query;}
			if (uri.anchor !== '') {retArr.fragment=uri.anchor;}
			return retArr;
	}
}

// *** END OF UTILS ***

// *** BEGIN PHONEGAP UTILS ***

function getPicture_Success(imageData) {
	MyAnswers.log("getPicture_Success: " + imageData);
  lastPictureTaken.image.put(lastPictureTaken.currentName, imageData);
  for (var i in document.forms[0].elements) {
		if (document.forms[0].elements.hasOwnProperty(i))
		{
			var thisElement = document.forms[0].elements[i];
			if (thisElement.name) {
				if(thisElement.type && (thisElement.type.toLowerCase() === "radio" || thisElement.type.toLowerCase() === "checkbox") && thisElement.checked === false) {
					$.noop(); // do nothing for unchecked radio or checkbox
				} else {
					if (thisElement.type && (thisElement.type.toLowerCase() === "button") && (lastPictureTaken.image.size() > 0)) {
						if (lastPictureTaken.currentName ==  thisElement.name) {
							thisElement.style.backgroundColor = "red";
						} 
					}
				}
			}
		}
  }
  MyAnswers.log("getpic success " + imageData.length);
}

function getPicture(sourceType) {
  var options = { quality: siteConfig.imageQuality, imageScale: siteConfig.imageScale };
  if (sourceType !== undefined)
  {
    options.sourceType = sourceType;
  }
  // if no sourceType specified, the default is CAMERA 
  navigator.camera.getPicture(getPicture_Success, null, options);
}

function selectCamera(nameStr) {
	MyAnswers.log("selectCamera: ");
  lastPictureTaken.currentName = nameStr;
  getPicture(PictureSourceType.CAMERA);
}

function selectLibrary(nameStr) {
	MyAnswers.log("selectLibrary: ");
  lastPictureTaken.currentName = nameStr;
  getPicture(PictureSourceType.PHOTO_LIBRARY);
}

// *** END PHONEGAP UTILS ***

// *** BEGIN BLINK UTILS ***

// take 2 plain strings, process them into XML, then transform the first using the second (XSL)
function generateMojoAnswer(xmlString, xslString, target)
{
	MyAnswers.log('generateMojoAnswer(): target=' + target + ' caller=' + generateMojoAnswer.caller.name);
	var html, xml, xsl;
	if (typeof(xmlString) !== 'string' || typeof(xslString) !== 'string') { return false; }
	if (xslString.indexOf('blink-stars(') !== -1) // check for star list
	{
		var type = xslString.match(/blink-stars\((.+),\W*(\w+)\W*\)/);
		var variable = type[1];
		type = type[2];
		var condition = '';
		if ($.type(starsProfile[type]) === 'object')
		{
			for (var star in starsProfile[type])
			{
				if (starsProfile[type].hasOwnProperty(star))
				{
					condition += ' or ' + variable + '=\'' + star + '\'';
				}
			}
			condition = condition.substr(4);
			if (condition.length > 0)
			{
				xslString = xslString.replace(/\(?blink-stars\((.+),\W*(\w+)\W*\)\)?/, '(' + condition + ')');
			}
		}
		MyAnswers.log('generateMojoAnswer(): condition=' + condition);
	}
	if (deviceVars.hasWebWorkers === true)
	{
		MyAnswers.log('generateMojoAnswer: enlisting Web Worker to perform XSLT');
		var message = { };
		message.fn = 'processXSLT';
		message.xml = xmlString;
		message.xsl = xslString;
		message.target = target;
		MyAnswers.webworker.postMessage(message);
		return '<p>This keyword is being constructed entirely on your device.</p><p>Please wait...</p>';
	}
	if (window.ActiveXObject !== undefined)
	{
		MyAnswers.log('generateMojoAnswer: using Internet Explorer method');
		xml = XML.newDocument().loadXML(xmlString);
		xsl = XML.newDocument().loadXML(xslString);
		html = xml.transformNode(xsl);
		return html;
	}
	xml = parseXMLElements(xmlString);
	xsl = parseXMLElements(xslString);
	if (window.XSLTProcessor !== undefined)
	{
		MyAnswers.log('generateMojoAnswer: performing XSLT via XSLTProcessor()');
		var xsltProcessor = new XSLTProcessor();
		xsltProcessor.importStylesheet(xsl);
		html = xsltProcessor.transformToFragment(xml, document);
		return html;
	}
	if (xsltProcess !== undefined)
	{
		MyAnswers.log('generateMojoAnswer: performing XSLT via AJAXSLT library');
		html = xsltProcess(xml, xsl);
		return html;
	}
	return '<p>Your browser does not support MoJO keywords.</p>';
}

function countPendingFormData() {
  if (getAnswerSpaceItem("_pendingFormDataString")) {
    var q1 = getAnswerSpaceItem("_pendingFormDataString").split(":");
    MyAnswers.log("countPendingFormData: q1.length = " + q1.length + ";");
    return q1.length;
  } else {
    return 0;
  }
}

function setSubmitCachedFormButton() {
  var queueCount = countPendingFormData();
	var button = document.getElementById('pendingButton');
  if (queueCount !== 0) {
    MyAnswers.log("setSubmitCachedFormButton: Cached items");
		insertText(button, queueCount + ' Pending');
		$(button).removeClass('hidden');
  } else {
    MyAnswers.log("setSubmitCachedFormButton: NO Cached items");
		$(button).addClass('hidden');
  }
  if (typeof(setupParts) === 'function')
  {
		setTimeout(function() {
			setupParts();
		}, 50);
	}
}

function headPendingFormData() {
  if (countPendingFormData() === 0) {
    return ["", ""];
  }
  var q1 = getAnswerSpaceItem("_pendingFormDataString").split(":");
  var q2 = getAnswerSpaceItem("_pendingFormDataArrayAsString").split(":");
  var q3 = getAnswerSpaceItem("_pendingFormMethod").split(":");
  var q4 = getAnswerSpaceItem("_pendingFormUUID").split(":");
  MyAnswers.log('headPendingFormData():');
  return [q1[0], decodeURIComponent(q2[0]), decodeURIComponent(q3[0]), decodeURIComponent(q4[0])];
}

function removeFormRetryData() {
    removeAnswerSpaceItem("_pendingFormDataString");  
    removeAnswerSpaceItem("_pendingFormDataArrayAsString");  
    removeAnswerSpaceItem("_pendingFormMethod");  
    removeAnswerSpaceItem("_pendingFormUUID");  
    setSubmitCachedFormButton();
    MyAnswers.log("removeFormRetryData: Clearing local storage"); 
}

function delHeadPendingFormData() {
  var count;
  if ((count = countPendingFormData()) === 0) {
    MyAnswers.log("delHeadPendingFormData: count 0, returning");
    return;
  }
  if (count == 1) {
    MyAnswers.log("*** Emptying Form Queue");
    removeFormRetryData();
    return;
  }
  setAnswerSpaceItem("_pendingFormDataString", 
		     getAnswerSpaceItem("_pendingFormDataString").substring(getAnswerSpaceItem("_pendingFormDataString").indexOf(":") + 1));
  setAnswerSpaceItem("_pendingFormDataArrayAsString", 
		     getAnswerSpaceItem("_pendingFormDataArrayAsString").substring(getAnswerSpaceItem("_pendingFormDataArrayAsString").indexOf(":") + 1));
}

function checkFormRetryData() {
    return (getAnswerSpaceItem("_pendingFormDataString"));
}

function processCachedFormData() {
  if (checkFormRetryData()) {
    if (confirm("Submit pending form data \nfrom previous forms?\nNote: Subsequent forms will continue to pend\nuntil you empty the pending list.")) {
      submitFormWithRetry();
    } else {
      if (confirm("Delete pending form data\nfrom previous forms?")) {
		  removeFormRetryData();
      }
    }
  }
}

// *** END BLINK UTILS ***

// *** BEGIN EVENT HANDLERS ***

function updateCache()
{
  MyAnswers.log("updateCache: " + webappCache.status);
  if (webappCache.status != window.applicationCache.IDLE) {
    webappCache.swapCache();
    MyAnswers.log("Cache has been updated due to a change found in the manifest");
  } else {
    webappCache.update();
    MyAnswers.log("Cache update requested");
  }
}

function errorCache()
{
  MyAnswers.log("errorCache: " + webappCache.status);
  MyAnswers.log("You're either offline or something has gone horribly wrong.");
}

function onTaskBegun(event)
{
	MyAnswers.runningTasks++;
	if ($('#startUp').size() > 0) { return true; }
	if (typeof(MyAnswers.activityIndicatorTimer) === 'number') { return true; }
	MyAnswers.activityIndicatorTimer = setTimeout(function() {
		clearTimeout(MyAnswers.activityIndicatorTimer);
		MyAnswers.activityIndicatorTimer = null;
		$(MyAnswers.activityIndicator).removeClass('hidden');
	}, 1000);
	return true;
}

function onTaskComplete(event)
{
	if (MyAnswers.runningTasks > 0)
	{
		MyAnswers.runningTasks--;
	}
	if (MyAnswers.runningTasks <= 0)
	{
		if (MyAnswers.activityIndicatorTimer !== null)
		{
			clearTimeout(MyAnswers.activityIndicatorTimer);
		}
		MyAnswers.activityIndicatorTimer = null;
		$(MyAnswers.activityIndicator).addClass('hidden');
	}
	return true;
}

function onStarClick(event)
{
	var id = $(this).data('id');
	var type = $(this).data('type');
	var data = $(this).data();
	delete data.id;
	delete data.type;
	if ($(this).hasClass('blink-star-on'))
	{
		$(this).addClass('blink-star-off');
		$(this).removeClass('blink-star-on');
		delete starsProfile[type][id];
		if (starsProfile[type] == { })
		{
			delete starsProfile[type];
		}
	}
	else if ($(this).hasClass('blink-star-off'))
	{
		$(this).addClass('blink-star-on');
		$(this).removeClass('blink-star-off');
		if ($.type(starsProfile[type]) !== 'object')
		{
			starsProfile[type] = { };
		}
		starsProfile[type][id] = { };
		for (var k in data)
		{
			if (data.hasOwnProperty(k))
			{
				starsProfile[type][id][k.toUpperCase()] = data[k];
			}
		}
		var date = new Date();
		starsProfile[type][id].time = date.getTime();
		starsProfile[type][id].type = type;
		starsProfile[type][id].id = id;
	}
	setAnswerSpaceItem('starsProfile', starsProfile);
}

function onAnswerDownloaded(event, view)
{
	MyAnswers.log('onAnswerDownloaded(): view=' + view);
	setTimeout(function() {
		$('body').trigger('taskBegun');
		if ($('#' + view).find('div.googlemap').size() > 0) // check for items requiring Google features (so far only #map)
		{
			$.getScript('http://www.google.com/jsapi?key=' + siteConfig.googleAPIkey, function(data, textstatus) {
				if ($('div.googlemap').size() > 0) // check for items requiring Google Maps
				{
					google.load('maps', '3', { other_params : 'sensor=true', 'callback' : setupGoogleMaps });
				}
				else
				{
					stopTrackingLocation();
				}
			});
		}
		$('#' + view + ' .blink-starrable').each(function(index, element) {
			var div = document.createElement('div');
			var data = $(element).data();
			populateDataTags(div, data);
			addEvent(div, 'click', onStarClick);
			if ($.type(starsProfile[$(element).data('type')]) !== 'object' || $.type(starsProfile[$(element).data('type')][$(element).data('id')]) !== 'object')
			{
				div.setAttribute('class', 'blink-starrable blink-star-off');
			}
			else
			{
				div.setAttribute('class', 'blink-starrable blink-star-on');
			}
			$(element).replaceWith(div);
		});
		$('body').trigger('taskComplete');
	}, 350);
}

function onTransitionComplete(event, view)
{
	MyAnswers.log('onTransitionComplete():', event);
	var inputs = $('input, textarea, select');
	inputs.unbind('blur', onScroll);
	inputs.bind('blur', onScroll);
}

function onSiteBootComplete(event)
{
	MyAnswers.log('onSiteBootComplete():');
	var keyword = siteVars.queryParameters.keyword;
	delete siteVars.queryParameters.keyword;
	if (typeof(keyword) === 'string' && ! $.isEmptyObject(siteVars.queryParameters))
	{
		showSecondLevelAnswerView(keyword, $.param(siteVars.queryParameters));
	}
	else if (typeof(keyword) === 'string')
	{
		gotoNextScreen(keyword);
	}
	else if (typeof(siteVars.queryParameters.category) === 'string')
	{
		showKeywordListView(siteVars.queryParameters.category);
	}
	else if (typeof(siteVars.queryParameters.master_category) === 'string')
	{
		showCategoriesView(siteVars.queryParameters.master_category);
	}
	else if (typeof(siteConfig.webClip) === 'string' && typeof(google) !== 'undefined' && typeof(google.bookmarkbubble) !== 'undefined')
	{
		setTimeout(function() {
			var bookmarkBubble = new google.bookmarkbubble.Bubble();
			bookmarkBubble.hasHashParameter = function() { return false; };
			bookmarkBubble.setHashParameter = $.noop;
			bookmarkBubble.getViewportHeight = function() {	return window.innerHeight; };
			bookmarkBubble.getViewportScrollY = function() { return window.pageYOffset;	};
			bookmarkBubble.registerScrollHandler = function(handler) { addEvent(window, 'scroll', handler); };
			bookmarkBubble.deregisterScrollHandler = function(handler) { window.removeEventListener('scroll', handler, false); };
			bookmarkBubble.showIfAllowed();
		}, 1000);
	}
	delete siteVars.queryParameters;
}

function updateOrientation()
{
	MyAnswers.log("orientationChanged: " + Orientation.currentOrientation);
	setupForms($('.view:visible'));
}

// *** END EVENT HANDLERS ***

if (!addEvent(document, "deviceready", onDeviceReady)) {
  alert("Unable to add deviceready handler");
  throw("Unable to add deviceready handler");
}

function addBackHistory(item)
{
	MyAnswers.log("addBackHistory(): " + item + ' caller=' + addBackHistory.caller.name);
	if (backStack.indexOf(item) == -1) { backStack.push(item); }
}

function showMasterCategoriesView()
{
  MyAnswers.log('showMasterCategoriesView()');
	addBackHistory("goBackToMasterCategoriesView();");
  prepareMasterCategoriesViewForDevice();
  setMainLabel('Master Categories');
  setCurrentView('masterCategoriesView', false);
}

function goBackToMasterCategoriesView()
{
  MyAnswers.log('goBackToMasterCategoriesView()');
	addBackHistory("goBackToMasterCategoriesView();");
  prepareMasterCategoriesViewForDevice();
  setMainLabel('Master Categories');
  setCurrentView('masterCategoriesView', true);
}

function populateVisualCategories(masterCategory)
{
	MyAnswers.log('populateVisualCategories(): caller=' + populateVisualCategories.caller.name);
	var order = hasMasterCategories ? siteConfig.master_categories[masterCategory].categories : siteConfig.categories_order;
	var list = siteConfig.categories;
	var categoriesBox = document.getElementById('categoriesBox');
	emptyDOMelement(categoriesBox);
	var onCategoryClick = function(event) { showKeywordListView(this.getAttribute('data-id')); };
	for (var id in order)
	{
		if (order.hasOwnProperty(id))
		{
			if (list[order[id]].status != 'active') { continue; }
			var image = document.createElement('img');
			image.setAttribute('class', 'v' + siteConfig.categories_config);
			image.setAttribute('data-id', order[id]);
			image.setAttribute('src', list[order[id]].image);
			image.setAttribute('alt', list[order[id]].name);
			categoriesBox.appendChild(image);
			addEvent(image, 'click', onCategoryClick);
		}
	}
	if (siteConfig.categories_config != 'auto')
	{
		var width, columns;
		switch (siteConfig.categories_config)
		{
			case "1col":
				columns = 1;
				break;
			case "2col":
				columns = 2;
				break;
			case "3col":
				columns = 3;
				break;
			case "4col":
				columns = 4;
				break;
		}
		var images = $(categoriesBox).find('img');
		images.width(width);
		if (siteConfig.categories_config === '1col')
		{
			images.first().addClass('roundedTopLeft roundedTopRight');
			images.last().addClass('roundedBottomLeft roundedBottomRight');
		}
		else
		{
			images.first().addClass('roundedTopLeft');
			if (images.size() >= columns)
			{
				images.eq(columns - 1).addClass('roundedTopRight');
			}
			if (images.size() % columns === 0)
			{
				images.eq(0 - columns).addClass('roundedBottomLeft');
				images.last().addClass('roundedBottomRight');
			}
		}
	}
}

function populateKeywordList(category) {
	MyAnswers.log('populateKeywordList(): category=' +  category + ' hasCategories=' + hasCategories + ' caller=' + populateKeywordList.caller.name);
	var width, columns;
	switch (siteConfig.keywords_config)
	{
		case "1col":
			columns = 1;
			break;
		case "2col":
			columns = 2;
			break;
		case "3col":
			columns = 3;
			break;
		case "4col":
			columns = 4;
			break;
	}
	var order = hasCategories ? siteConfig.categories[category].keywords : siteConfig.keywords_order;
	var list = siteConfig.keywords;
	var keywordList = document.getElementById('keywordList');
	var keywordBox = document.getElementById('keywordBox');
	emptyDOMelement(keywordList);
	emptyDOMelement(keywordBox);
	var onKeywordClick = function(event) { gotoNextScreen(this.getAttribute('data-id')); };
	for (var id in order)
  {
		if (order.hasOwnProperty(id))
		{
			if (list[order[id]].status != 'active') { continue; }
			if (siteConfig.keywords_config != 'no' && (!hasCategories || siteConfig.categories[category].textKeywords != 'Y') && list[order[id]].image)
			{
				var image = document.createElement('img');
				image.setAttribute('class', 'v' + siteConfig.keywords_config);
				image.setAttribute('data-id', order[id]);
				image.setAttribute('src', list[order[id]].image);
				image.setAttribute('alt', list[order[id]].name);
				keywordBox.appendChild(image);
				addEvent(image, 'click', onKeywordClick);
			}
			else
			{
				var item = document.createElement('li');
				item.setAttribute('data-id', order[id]);
				var label = document.createElement('div');
				label.setAttribute('class', 'label');
				insertText(label, list[order[id]].name);
				item.appendChild(label);
				//htmlList += "<div class='nextArrow'></div>";
				if (typeof(list[order[id]].description) == 'string')
				{
					var description = document.createElement('div');
					description.setAttribute('class', 'description');
					insertText(description, list[order[id]].description);
					item.appendChild(description);
				}
				keywordList.appendChild(item);
				addEvent(item, 'click', onKeywordClick);
			}
		}
  }
	keywordList = $(keywordList);
	keywordBox = $(keywordBox);
	if (keywordBox.children().size() > 0)
	{
		var images = keywordBox.find('img');
		images.width(width);
		if (siteConfig.keywords_config === '1col')
		{
			images.first().addClass('roundedTopLeft roundedTopRight');
			images.last().addClass('roundedBottomLeft roundedBottomRight');
		}
		else
		{
			images.first().addClass('roundedTopLeft');
			if (images.size() >= columns)
			{
				images.eq(columns - 1).addClass('roundedTopRight');
			}
			if (images.size() % columns === 0)
			{
				images.eq(0 - columns).addClass('roundedBottomLeft');
				images.last().addClass('roundedBottomRight');
			}
		}
		keywordBox.removeClass('hidden');
	}
	else
	{
		keywordBox.addClass('hidden');
	}
	if (keywordList.children().size() > 0)
	{
		keywordList.removeClass('hidden');
	}
	else
	{
		keywordList.addClass('hidden');
	}
}

function showCategoriesView(masterCategory)
{
	MyAnswers.log('showCategoriesView(): ' + masterCategory);
	if (masterCategory && siteConfig.master_categories[masterCategory])
	{
		currentMasterCategory = masterCategory;
		var masterConfig = siteConfig.master_categories[masterCategory];
		if ($.type(siteConfig.default_category) === 'number' && $.type(masterConfig.categories[siteConfig.default_category]) === 'object')
		{
			currentCategory = siteConfig.default_category;
		}
		else
		{
			currentCategory = masterConfig.categories[0];
		}
	}
	else
	{
		currentCategory = siteConfig.default_category ? siteConfig.default_category : siteConfig.categories_order[0] ;
	}
	addBackHistory("goBackToCategoriesView();");
  prepareCategoriesViewForDevice();
	if (hasVisualCategories)
	{
		setMainLabel(hasMasterCategories ? siteConfig.master_categories[masterCategory].name : 'Categories');
		populateVisualCategories(masterCategory);
		setCurrentView('categoriesView', false);
	}
	else
	{
		populateTextOnlyCategories(masterCategory);
		populateKeywordList(currentCategory);
		showKeywordListView();
	}
}

function goBackToCategoriesView()
{
  MyAnswers.log('goBackToCategoriesView()');
	addBackHistory("goBackToCategoriesView();");
  prepareCategoriesViewForDevice();
	setMainLabel(hasMasterCategories ? siteConfig.master_categories[currentMasterCategory].name : 'Categories');
  setCurrentView('categoriesView', true);
}

function restoreSessionProfile(token)
{
	MyAnswers.log('restoreSessionProfile(): caller=' + restoreSessionProfile.caller.name);
	var requestUrl = siteVars.serverAppPath + '/util/GetSession.php';
	var requestData = '_as=' + siteVars.answerSpace + '&_t=' + token;
	ajaxQueue.add({
		url: requestUrl,
		data: requestData,
		dataType: 'json',
		complete: function(xhr, xhrStatus) {
			if (isAJAXError(xhrStatus) || xhr.status !== 200)
			{
				alert('Connection error, please try again later.');
				return;
			}
			var data = JSON.parse(xhr.responseText);
			if (data === null)
			{
				MyAnswers.log('GetSiteConfig error: null siteConfig');
				alert('Connection error, please try again later.');
				return;
			}
			if (typeof(data.errorMessage) !== 'string' && typeof(data.statusMessage) !== 'string')
			{
				MyAnswers.log('GetSession success: no error messages, data: ' + data);
				if (data.sessionProfile === null) { return; }
				setAnswerSpaceItem('starsProfile', data.sessionProfile.stars);
				starsProfile = data.sessionProfile.stars;
			}
			if (typeof(data.errorMessage) === 'string')
			{
				MyAnswers.log('GetSiteConfig error: ' + data.errorMessage);
			}
			setTimeout(function() {
				$('body').trigger('siteBootComplete');
			}, 100);
		},
		timeout: computeTimeout(10 * 1024)
	});
}

function populateMasterCategories()
{
	MyAnswers.log('populateMasterCategories(): caller=' + populateMasterCategories.caller.name);
	var order = siteConfig.master_categories_order;
	var list = siteConfig.master_categories;
	var masterCategoriesBox = document.getElementById('masterCategoriesBox');
	emptyDOMelement(masterCategoriesBox);
	var onMasterCategoryClick = function(event) { showCategoriesView(this.getAttribute('data-id')); };
	for (var id in order)
	{
		if (order.hasOwnProperty(id))
		{
			if (list[order[id]].status != 'active') { continue; }
			var image = document.createElement('img');
			image.setAttribute('class', 'v' + siteConfig.master_categories_config);
			image.setAttribute('data-id', order[id]);
			image.setAttribute('src', list[order[id]].image);
			image.setAttribute('alt', list[order[id]].name);
			masterCategoriesBox.appendChild(image);
			addEvent(image, 'click', onMasterCategoryClick);
		}
	}
	if (siteConfig.master_categories_config != 'auto')
	{
		var width, columns;
		switch (siteConfig.master_categories_config)
		{
			case "1col":
				columns = 1;
				break;
			case "2col":
				columns = 2;
				break;
			case "3col":
				columns = 3;
				break;
			case "4col":
				columns = 4;
				break;
		}
		var images = $(masterCategoriesBox).find('img');
		images.width(width);
		if (siteConfig.master_categories_config === '1col')
		{
			images.first().addClass('roundedTopLeft roundedTopRight');
			images.last().addClass('roundedBottomLeft roundedBottomRight');
		}
		else
		{
			images.first().addClass('roundedTopLeft');
			if (images.size() >= columns)
			{
				images.eq(columns - 1).addClass('roundedTopRight');
			}
			if (images.size() % columns === 0)
			{
				images.eq(0 - columns).addClass('roundedBottomLeft');
				images.last().addClass('roundedBottomRight');
			}
		}
	}
}

function displayAnswerSpace()
{
	var startUp = $('#startUp');
	if (startUp.size() > 0 && typeof(siteConfig) !== 'undefined')
	{
		if (answerSpaceOneKeyword)
		{
			showKeywordView(0);
		}
		else if (hasMasterCategories)
		{
			populateMasterCategories();
			showMasterCategoriesView();
		}
		else if (hasVisualCategories)
		{
			populateVisualCategories(currentMasterCategory);
			showCategoriesView();
		}
		else if (hasCategories)
		{
			currentCategory = siteConfig.default_category ? siteConfig.default_category : siteConfig.categories_order[0] ;
			showKeywordListView(currentCategory);
		}
		else
		{
			showKeywordListView();
		}
		var token = siteVars.queryParameters._t;
		delete siteVars.queryParameters._t;
		if (typeof(token) === 'string') { restoreSessionProfile(token); }
		else { $('body').trigger('siteBootComplete'); }
	}
	startUp.remove();
	$('#content').removeClass('hidden');
}

function processMoJOs(keyword)
{
	MyAnswers.log('processMoJOs(): keyword=' + keyword + ' caller=' + processMoJOs.caller.name);
	if (deviceVars.disableXSLT === true) { return; }
	var requestURL = siteVars.serverAppPath + '/util/GetMoJO.php';
	var fetchedMoJOs = { };
	var ajaxComplete = function(xhr, xhrStatus, xhrOptions) {
		if (!isAJAXError(xhrStatus) && xhr.status === 200)
		{
			var data = JSON.parse(xhr.responseText);
			if (data === null)
			{
				MyAnswers.log('GetSiteConfig error: null siteConfig');
			}
			else if (data.errorMessage)
			{
				MyAnswers.log('GetMoJO error: ' + xhrOptions.mojoName + ' ' + data.errorMessage);
			}
			else 
			{
				if (data.statusMessage !== 'NO UPDATES' && deviceVars.storageReady)
				{
					setAnswerSpaceItem('mojoMessage-' + xhrOptions.mojoName, data);
				}
			}
		}
	};
	for (var m in siteConfig.mojoKeys)
	{
		if (siteConfig.mojoKeys.hasOwnProperty(m))
		{
			var mojoName = siteConfig.mojoKeys[m];
			if (keyword !== undefined && keyword !== m) { continue; }
			if (mojoName.substr(0,6) === 'stars:') { continue; }
			if (fetchedMoJOs[mojoName] === true) { continue; }
			var message = getAnswerSpaceItem('mojoMessage-' + mojoName);
			var mojoHash;
			if (typeof(message) !== 'undefined' && message !== null)
			{
				mojoHash = message.mojoHash;
			}
			var requestData = 'answerSpace=' + siteVars.answerSpace + '&key=' + mojoName + (typeof(mojoHash) === 'string' ? "&sha1=" + mojoHash : "");
			ajaxQueueMoJO.add({
				url: requestURL,
				data: requestData,
				dataType: 'json',
				mojoName: mojoName,
				complete: ajaxComplete,
				timeout: computeTimeout(500 * 1024)
			});
			fetchedMoJOs[mojoName] = true;
		}
	}
}

function processSiteConfig()
{
	MyAnswers.log('processSiteConfig(): caller=' + processSiteConfig.caller.name);
	try {
		hasMasterCategories = siteConfig.master_categories_config != 'no';
		hasVisualCategories = siteConfig.categories_config != 'yes' && siteConfig.categories_config != 'no';
		hasCategories = siteConfig.categories_config !== 'no' && ! $.isEmptyObject(siteConfig.categories);
		answerSpaceOneKeyword = siteConfig.keywords.length == 1; // TODO this line accomplishes nothing, always false
		displayAnswerSpace();
		processMoJOs();
	} catch(e) {
		MyAnswers.log("processSiteConfig: Exception");
		MyAnswers.log(e);
	}
}

function getSiteConfig()
{
	MyAnswers.log("getSiteConfig(): typeof(siteConfig) => " + $.type(siteConfig) + ' caller=' + getSiteConfig.caller.name);
	var fallbackToStorage = function(string) {
		if (typeof(siteConfig) != 'undefined')
		{
			processSiteConfig();
		}
		else
		{
			alert(string);
			window.location = '/demos';
		}
	};
	var requestUrl = siteVars.serverAppPath + '/util/GetSiteConfig.php';
	var requestData = 'device=' + deviceVars.device + '&answerSpace=' + siteVars.answerSpace + (typeof(siteConfigHash) == 'string' ? "&sha1=" + siteConfigHash : "");
	ajaxQueue.add({
		url: requestUrl,
		data: requestData,
		dataType: 'json',
		complete: function(xhr, xhrStatus) {
			if (isAJAXError(xhrStatus) || xhr.status !== 200)
			{
				fallbackToStorage('Content unreachable, please try later.');
				return;
			}
			/*	possible values of errorMessage:
			 *	'No answerSpace specified.'
			 *	'Could not connect to the database.'
			 *	'Error performing answerSpace query: ' ...
			 *	'NOT LOGGED IN'
			 *	'Error performing master categories query: ' ...
			 *	'Error performing categories query: ' ...
			 *	'Error performing keywords query: ' ...
			 *	
			 *	possible values of statusMessage:
			 *	'NO KEYWORDS'
			 *	'NO UPDATES'
			 */
			var data = JSON.parse(xhr.responseText);
			if (data === null)
			{
				MyAnswers.log('GetSiteConfig error: null siteConfig');
				fallbackToStorage('Content unreachable, please try again later.');
				return;
			}
			if (typeof(data.errorMessage) !== 'string' && typeof(data.statusMessage) !== 'string')
			{
				MyAnswers.log('GetSiteConfig success: no status or error messages', data);
				setAnswerSpaceItem('siteConfigMessage', data);
				siteConfig = data.siteConfig;
				siteConfigHash = data.siteHash;
				processSiteConfig();
				MyAnswers.log('post-store siteConfig type:' + typeof(getAnswerSpaceItem('siteConfigMessage')));
				return;
			}
			if (typeof(data.statusMessage) === 'string')
			{
				switch (data.statusMessage)
				{
					case 'NO UPDATES':
						MyAnswers.log("GetSiteConfig status: " + data.statusMessage, siteConfig);
						break;
					case 'NO KEYWORDS':
						setAnswerSpaceItem('siteConfigMessage', data);
						siteConfig = data.siteConfig;
						siteConfigHash = data.siteHash;
						MyAnswers.log("GetSiteConfig status: " + data.statusMessage, data);
						break;
				}
				processSiteConfig();
				return;
			}
			if (typeof(data.errorMessage) === 'string')
			{
				MyAnswers.log('GetSiteConfig error: ' + data.errorMessage);
				switch (data.errorMessage)
				{
					case 'NOT LOGGED IN':
						alert('This answerSpace requires users to log in.');
						displayAnswerSpace();
						break;
					case 'NO MATCHING ANSWERSPACE':
					case 'ANSWERSPACE UNSPECIFIED':
						fallbackToStorage('Please check the name of the answerSpace and try again.');
						break;
					default:
						fallbackToStorage('Content unreachable, please try again later.');
						break;
				}
				return;
			}
		},
		timeout: computeTimeout(40 * 1024)
	});
}

/*
function populateAnswerSpacesList() {
	MyAnswers.log('populateAnswerSpacesList()');
	var welcome = document.getElementById('answerSpacesListView').getElementById('welcomeBox');
	var listBox = $('#answerSpacesList');
  listBox.empty();
	var list = answerSpacesList.answerSpaces;
	for (var a in list)
  {
		if (list.hasOwnProperty(a))
		{
			var html = "<a href=\"/" + list[a].name + "\"><li>";
			html += list[a].icon ? "<img src=\"" + list[a].icon + "\" alt=\"" + list[a].title + "\" />" : "";
			html += "<div class='label'" + (!list[a].icon ? "style=\"width:90%\"" : "") + ">" + list[a].title + "</div>";
			html += "<div class='description'>" + list[a].name + "</div>";
			html += "</li></a>";
			listBox.append(html);
		}
  }
	if (listBox.children().size() > 0)
	{
		listBox.removeClass('hidden');
		if (siteVars.answerSpace)
		{
			insertText(welcome, 'Please check the address you have entered, or choose from a range of answerSpaces below.');
		}
		else
		{
			insertText(welcome, 'Please choose from a range of answerSpaces below.');
		}
	}
	else
	{
		insertText(welcome, 'Please check the address you have entered.');
	}
}
*/

if (typeof(webappCache) !== "undefined")
{
  addEvent(webappCache, "updateready", updateCache);
  addEvent(webappCache, "error", errorCache);
}
 
function getAnswerSpacesList()
{
	$('body').trigger('taskBegun');
	var answerSpacesUrl = siteVars.serverAppPath + '/util/GetAnswerSpaces.php';
	var requestData = answerSpacesHash ? "sha1=" + answerSpacesHash : "";
	MyAnswers.log("GetAnswerSpaces transaction: " + answerSpacesUrl + "?" + requestData);
	$.getJSON(answerSpacesUrl, requestData,
		function(data, textstatus) { // readystate == 4
			MyAnswers.log("GetAnswerSpaces transaction complete: " + textstatus);
			//MyAnswers.log(data);
			$('body').trigger('taskComplete');
			if (textstatus != 'success') { return; }
			if (data.errorMessage)
			{
				MyAnswers.log("GetAnswerSpaces error: " + data.errorMessage);
			}
			else
			{
				MyAnswers.log("GetAnswerSpaces status: " + data.statusMessage);
				if (!data.statusMessage || data.statusMessage != "NO UPDATES")
				{
					answerSpacesHash = data.listHash;
					answerSpacesList = data.list;
				}
				var startUp = $('#startUp');
				if (startUp.size() > 0)
				{
					populateAnswerSpacesList();
					showAnswerSpacesListView();
					startUp.remove();
					$('#content').removeClass('hidden');
				}
			}
		});
}

function dumpLocalStorage() {
  var numElements = localStorage.length;
  for (var i = 0; i < numElements; i++)
  {
		var key, value;
		key = localStorage.key(i);
		value = localStorage.getItem(key);
		value = value.length > 20 ? value.substring(0, 20) + "..." : value;
		MyAnswers.log("dumpLocalStorage: key = " + key + "; value = " + value + ";");
  }
}

// test to see if the user it viewing the highest level screen
function isHome()
{
	if ($('.view:visible').first().attr('id') == $('.box:not(:empty)').first().parent().attr('id'))
	{
		return true;
	}
	return false;
}

function goBackToHome()
{
	backStack = [];
	hashStack = [];
	if (hasMasterCategories) { goBackToMasterCategoriesView(); }
	else if (hasVisualCategories) { goBackToCategoriesView(); }
	else { goBackToKeywordListView(); }
	stopTrackingLocation();
	getSiteConfig();
}

function goBack()
{
	backStack.pop();
	if (backStack.length >= 1) { eval(backStack[backStack.length-1]); }
	else { goBackToHome(); }
	stopTrackingLocation();
	if (isHome()) { getSiteConfig(); }
}

function createParamsAndArgs(keywordID)
{
  var returnValue = "answerSpace=" + siteVars.answerSpace + "&keyword=" + encodeURIComponent(siteConfig.keywords[keywordID].name);
  var args = "";
  var argElements = $('#argsBox').find('input, textarea, select');
  argElements.each(function(index, element) {
		if (this.type && (this.type.toLowerCase() == "radio" || this.type.toLowerCase() == "checkbox") && !this.checked)
		{
			$.noop(); // do nothing if not checked
		}
		else if (this.name)
		{
			args += "&" + this.name + "=" + (this.value ? encodeURIComponent(this.value) : "");
		}
		else if (this.id && this.id.match(/\d+/g))
		{
			args += "&args[" + this.id.match(/\d+/g) + "]=" + (this.value ? encodeURIComponent(this.value) : "");
		}
  });
  if (args.length > 0)
  {
	 returnValue += encodeURI(args);
  }
	else if (argElements.size() == 1 && this.value)
	{
		returnValue += "&args=" + encodeURIComponent(this.value);
	}
  return returnValue;
}

function setupForms(view)
{
	var hasHiddenColumns = false;
	setTimeout(function() {
		$('body').trigger('taskBegun');
		// correct input elements that are too large in forms
		var form = view.find('form');
		var totalWidth = form.width();
		var firstColumnWidth = $('.bForm-input').first().siblings().first().width();
		var targetWidth = totalWidth - firstColumnWidth - 32;
		form.find('td, select, input, textarea').each(function(index, element) {
			if ($(element).width() > targetWidth)
			{
				$(element).width(targetWidth);
			}
		});
		// correct result tables that are too wide
		var results = view.find('.bForm-results');
		results.find('.hidden').removeClass('hidden');
		var columns = results.find('tr').first().find('td, th').size();
		var attempts = 5;
		while (results.width() > view.width() && columns >= 2 && attempts > 0)
		{
			results.find('td:nth-child(' + columns + '), th:nth-child(' + columns + ')').addClass('hidden');
			hasHiddenColumns = true;
			columns--;
			attempts--;
		}
		$('body').trigger('taskComplete');
	}, 300);
	setTimeout(function() {
		if (hasHiddenColumns)
		{
			if (window.orientation == -90 || window.orientation == 90)
			{
				alert('One or more columns has been hidden to fit this display.');
			}
			else
			{
				alert('Rotating your device may allow more columns to be displayed.');
			}
		}
	}, 600);
}

function showAnswerView(keyword)
{
	var keywordID, a, regex, html;
	if ($.type(siteConfig.keywords[keyword]) === 'object')
	{
		keywordID = keyword;
	}
	else
	{
		for (var k in siteConfig.keywords)
		{
			if (siteConfig.keywords.hasOwnProperty(k))
			{
				if (keyword.toUpperCase() == siteConfig.keywords[k].name.toUpperCase())
				{
					keywordID = k;
					break;
				}
			}
		}
	}
	if (keywordID === null) { return; }
	if ($.type(siteConfig.keywords[keywordID]) !== 'object') { return; }
	addBackHistory("goBackToTopLevelAnswerView();");
	currentKeyword = keywordID;
  prepareAnswerViewForDevice();
	processMoJOs(keywordID);
	var answerBox = document.getElementById('answerBox');
	keyword = siteConfig.keywords[keywordID];
	var args = deserialize(createParamsAndArgs(keywordID));
	delete args.answerSpace;
	delete args.keyword;
	if (keyword.type == 'xslt' && deviceVars.disableXSLT !== true)
	{
		var mojoMessage = getAnswerSpaceItem('mojoMessage-' + keyword.mojo);
		var xml, xslt;
		if (keyword.mojo.substr(0,6) === 'stars:')
		{
			$('body').trigger('taskBegun');
			var type = keyword.mojo.split(':')[1];
			for (var s in starsProfile[type])
			{
				if (starsProfile[type].hasOwnProperty(s))
				{
					xml += '<' + type + ' id="' + s + '">';
					for (var d in starsProfile[type][s])
					{
						if (starsProfile[type][s].hasOwnProperty(d))
						{
							xml += '<' + d + '>' + starsProfile[type][s][d] + '</' + d + '>';
						}
					}
					xml += '</' + type + '>';
				}
			}
			xml = '<stars>' + xml + '</stars>';
			xslt = keyword.xslt;
			var placeholders = xslt.match(/\$args\[\d+\]/g);
			for (var p in placeholders)
			{
				if (placeholders.hasOwnProperty(p))
				{
					var value = typeof(args[placeholders[p].substring(1)]) === 'string' ? args[placeholders[p].substring(1)] : '';
					xslt = xslt.replace(placeholders[p], value);
				}
			}
			html = generateMojoAnswer(xml, xslt, 'answerBox');
			insertHTML(answerBox, html);
			$('body').trigger('taskComplete');
		}
		else if (typeof(mojoMessage) !== 'undefined' && mojoMessage !== 'undefined')
		{
			$('body').trigger('taskBegun');			
			xml = getAnswerSpaceItem('mojoMessage-' + keyword.mojo).mojo;
			xslt = keyword.xslt;
			var placeholders = xslt.match(/\$args\[\d+\]/g);
			for (var p in placeholders)
			{
				if (placeholders.hasOwnProperty(p))
				{
					var value = typeof(args[placeholders[p].substring(1)]) === 'string' ? args[placeholders[p].substring(1)] : '';
					xslt = xslt.replace(placeholders[p], value);
				}
			}
			html = generateMojoAnswer(xml, xslt, 'answerBox');
			insertHTML(answerBox, html);
			$('body').trigger('taskComplete');
		}
		else
		{
			emptyDOMelement(answerBox);
			var paragraph1 = document.createElement('p');
			insertText(paragraph1, 'The data for this keyword is currently being downloaded to your handset for fast and efficient viewing. This will only occur again if the data is updated remotely.');
			var paragraph2 = document.createElement('p');
			insertText(paragraph2, 'Please try again in 30 seconds.');
			answerBox.appendChild(paragraph1);
			answerBox.appendChild(paragraph2);
		}
		setCurrentView("answerView", false, true);
		$('body').trigger('answerDownloaded', ['answerView']);
		setMainLabel(keyword.name);
	}
	else
	{
		var answerUrl = siteVars.serverAppPath + '/util/GetAnswer.php';
		var requestData = createParamsAndArgs(keywordID) + '&_device=' + deviceVars.device;
		var fallbackToStorage = function() {
			html = getAnswerSpaceItem("answer___" + keywordID);
			if (html === undefined)
			{
				html = '<p>Unable to reach server, and unable to display previously stored content.</p>';
			}
		};
		$('body').trigger('taskBegun');
		ajaxQueue.add({
		 type: 'GET',
		 url: answerUrl,
		 data: requestData,
		 beforeSend: function(xhr) {
			setSubmitCachedFormButton();
		 },
		 complete: function(xhr, textstatus) { // readystate == 4
			if (isAJAXError(textstatus) || xhr.status !== 200) { fallbackToStorage(); }
			else
			{
				MyAnswers.log('GetAnswer: storing server response');
				html = xhr.responseText;
				var blinkAnswerMessage = html.match(/<!-- blinkAnswerMessage:(.*) -->/);
				if (blinkAnswerMessage !== null)
				{
					processBlinkAnswerMessage(blinkAnswerMessage[1]);
				}
				setAnswerSpaceItem("answer___" + keywordID, html);
			}
			insertHTML(answerBox, html);
			setSubmitCachedFormButton();
			setCurrentView("answerView", false, true);
			setupForms($('#answerView'));
			$('body').trigger('answerDownloaded', ['answerView']);
			setMainLabel(keyword.name);
			$('body').trigger('taskComplete');
		 },
		 timeout: 30 * 1000 // 30 seconds
		});
	}
}

function getAnswer(event)
{
  showAnswerView(currentKeyword);
}

function gotoNextScreen(keywordID)
{
  MyAnswers.log("gotoNextScreen(" + keywordID + ")");
	if (!siteConfig.keywords[keywordID]) { // in case parameter is name not code
		for (var k in siteConfig.keywords)
		{
			if (siteConfig.keywords.hasOwnProperty(k))
			{
				if (keywordID.toUpperCase() == siteConfig.keywords[k].name.toUpperCase())
				{
					keywordID = k;
					break;
				}
			}
		}
	}
	if (!siteConfig.keywords[keywordID])
	{
		alert('Unable to locate keyword. It may be missing or protected.');
		return;
	}
  if (siteConfig.keywords[keywordID].input_config)
  {
		showKeywordView(keywordID);
  }
  else
  {
		showAnswerView(keywordID);
  }
}

function showSecondLevelAnswerView(keyword, arg0, reverse)
{
	MyAnswers.log('showSecondLevelAnswerView(): keyword=' + keyword + ' args=' + arg0);
	var keywordID, html;
	keyword = decodeURIComponent(keyword);
	arg0 = decodeURIComponent(arg0);
  prepareSecondLevelAnswerViewForDevice(keyword, arg0);
	addBackHistory("showSecondLevelAnswerView(\"" + keyword + "\", \"" + arg0 + "\", true);");
	for (var k in siteConfig.keywords)
	{
		if (siteConfig.keywords.hasOwnProperty(k))
		{
			if (keyword.toUpperCase() == siteConfig.keywords[k].name.toUpperCase())
			{
				keywordID = k;
				break;
			}
		}
	}
	processMoJOs(keywordID);
	var answerBox2 = document.getElementById('answerBox2');
	var keywordConfig = siteConfig.keywords[keywordID];
	if ($.type(keywordConfig) === 'object' && keywordConfig.type == 'xslt' && deviceVars.disableXSLT !== true)
	{
		MyAnswers.log('showSecondLevelAnswerView: detected XSLT keyword');
		$('body').trigger('taskBegun');
		var xml = getAnswerSpaceItem('mojoMessage-' + keywordConfig.mojo).mojo;
		var xslt = keywordConfig.xslt;
		var args = deserialize(arg0);
		var placeholders = xslt.match(/\$args\[\d+\]/g);
		for (var p in placeholders)
		{
			if (placeholders.hasOwnProperty(p))
			{
				var value = typeof(args[placeholders[p].substring(1)]) === 'string' ? args[placeholders[p].substring(1)] : '';
				xslt = xslt.replace(placeholders[p], value);
			}
		}
		html = generateMojoAnswer(xml, xslt, 'answerBox2');
		insertHTML(answerBox2, html);
		setCurrentView("answerView2", false, true);
		$('body').trigger('answerDownloaded', ['answerView2']);
		setMainLabel(keywordConfig.name);
		$('body').trigger('taskComplete');
	}
	else
	{
		var answerUrl = siteVars.serverAppPath + '/util/GetAnswer.php';
		var requestData = 'answerSpace=' + siteVars.answerSpace + "&keyword=" + encodeURIComponent(keyword) + '&_device=' + deviceVars.device + '&' + arg0;
		var fallbackToStorage = function() {
			html = getAnswerSpaceItem("answer___" + keywordID);
			if (html === undefined)
			{
				html = '<p>Unable to reach server, and unable to display previously stored content.</p>';
			}
		};
		$('body').trigger('taskBegun');
		ajaxQueue.add({
			type: 'GET',
			url: answerUrl,
			data: requestData,
			beforeSend: function(xhr) {
				setSubmitCachedFormButton();
				insertText(answerBox2, 'Waiting...');
			},
			complete: function(xhr, textstatus) { // readystate == 4
				if (isAJAXError(textstatus) || xhr.status !== 200) { fallbackToStorage(); }
				else
				{
					html =  xhr.responseText;
					var blinkAnswerMessage = html.match(/<!-- blinkAnswerMessage:(.*) -->/);
					if (blinkAnswerMessage !== null)
					{
						processBlinkAnswerMessage(blinkAnswerMessage[1]);
					}
				}
				insertHTML(answerBox2, html);
				setCurrentView('answerView2', false, true);   
				$('body').trigger('answerDownloaded', ['answerView2']);
				setupForms($("#answerView2"));
				$('body').trigger('taskComplete');
			}
		});
	}
}

function showKeywordView(keywordID) 
{
	addBackHistory("goBackToKeywordView(\"" + keywordID + "\");");
	var keyword = siteConfig.keywords[keywordID];
	setMainLabel(keyword.name);
  currentKeyword = keywordID;
  prepareKeywordViewForDevice(answerSpaceOneKeyword, typeof(keyword.help) == 'string');
  setSubmitCachedFormButton();
  var argsBox = document.getElementById('argsBox');
  insertHTML(argsBox, keyword.input_config);
	var descriptionBox = document.getElementById(descriptionBox);
  if (keyword.description) {
		insertHTML(descriptionBox, keyword.description);
		$(descriptionBox).removeClass('hidden');
  } else {
		$(descriptionBox).addClass('hidden');
  }
  setCurrentView('keywordView', false, true);
}

function goBackToKeywordView(keywordID)
{
	var keyword = siteConfig.keywords[keywordID];
	setMainLabel(keyword.name);
  currentKeyword = keywordID;
  prepareKeywordViewForDevice(answerSpaceOneKeyword, typeof(keyword.help) == 'string');
  setSubmitCachedFormButton();
  setCurrentView('keywordView', true, true);
}

function showKeywordListView(category)
{
	MyAnswers.log('showKeywordListView(): ' + category);
	currentCategory = category;
	var mainLabel;
	if (hasCategories)
	{
		mainLabel = siteConfig.categories[category].name;
	}
	else if (hasMasterCategories && currentMasterCategory)
	{
		mainLabel = siteConfig.master_categories[currentMasterCategory].name;
	}
	else
	{
		mainLabel = "Keywords";
	}
	if (hasCategories && !hasVisualCategories)
	{
		populateTextOnlyCategories(currentMasterCategory);
	}
	if ((hasCategories && siteConfig.categories[currentCategory].keywords.length == 1) ||
			(!hasCategories && siteConfig.keywords.length == 1))
	{
		MyAnswers.log('category only has one keyword, jumping to that keyword');
		gotoNextScreen(siteConfig.categories[currentCategory].keywords[0]);
		return;
	}
	addBackHistory("goBackToKeywordListView();");
	setMainLabel(mainLabel);
  prepareKeywordListViewForDevice(category);
	populateKeywordList(category);
  setCurrentView('keywordListView', false);
}

function showAnswerSpacesListView()
{
	prepareAnswerSpacesListViewForDevice();
	setCurrentView('answerSpacesListView', false);
}

function goBackToKeywordListView(event)
{
  //MyAnswers.log('goBackToKeywordListView()');
  if (answerSpaceOneKeyword) {
		showKeywordView(0);
		return;
  }
  if (hasMasterCategories && currentMasterCategory === null)
  {
		goBackToMasterCategoriesView();
		return;
  }
  if (hasVisualCategories && currentCategory === null)
  {
		goBackToCategoriesView(hasMasterCategories ? currentCategory : null);
		return;
  }
  prepareKeywordListViewForDevice();
  setSubmitCachedFormButton();
	setMainLabel(hasCategories ? siteConfig.categories[currentCategory].name : 'Keywords');
  setCurrentView('keywordListView', true);
}

function showHelpView(event)
{
	var helpContents, keyword, helpBox;
	switch($('.view:visible').attr('id'))
	{
		case 'keywordView':
		case 'answerView':
		case 'answerView2':
			keyword = siteConfig.keywords[currentKeyword];
		  setMainLabel(keyword.name);
		  helpContents = keyword.help ? keyword.help : "Sorry, no guidance has been prepared for this item.";
			break;
		default:
			helpContents = siteConfig.help ? siteConfig.help : "Sorry, no guidance has been prepared for this item.";
	}
	prepareHelpViewForDevice();
	addBackHistory("showHelpView();");
	helpBox = document.getElementById('helpBox');
	insertHTML(helpBox, helpContents);
  setCurrentView('helpView', false, true); 
}

function showNewLoginView(isActivating)
{
  prepareNewLoginViewForDevice();
	addBackHistory("showNewLoginView();");
  setMainLabel('New Login');
  var loginUrl = siteVars.serverAppPath + '/util/CreateLogin.php';
	var requestData = 'activating=' + isActivating;
  ajaxQueue.add({
		type: 'GET',
		cache: "false",
		url: loginUrl,
		data: requestData,
		complete: function(xhr, textstatus) { // readystate == 4
			var newLoginBox = document.getElementById('newLoginBox');
			if (isAJAXError(textstatus) && xhr.status !== 200)
			{
				insertText(newLoginBox, 'Unable to contact server.');
			}
			else
			{
				insertHTML(newLoginBox, xhr.responseText);
			}
			setCurrentView('newLoginView', false, true); 
		}
  });
}

function showActivateLoginView(event)
{
  prepareActivateLoginViewForDevice();
	addBackHistory("showActivateLoginView();");
  setMainLabel('Activate Login');
  var loginUrl = siteVars.serverAppPath + '/util/ActivateLogin.php';
  ajaxQueue.add({
		type: 'GET',
		cache: "false",
		url: loginUrl,
		complete: function(xhr, textstatus) { // readystate == 4
			var activateLoginBox = document.getElementById('activateLoginBox');
			if (isAJAXError(textstatus) && xhr.status !== 200)
			{
				insertText(activateLoginBox, 'Unable to contact server.');
			}
			else
			{
				insertHTML(activateLoginBox, xhr.responseText);
			}
			setCurrentView('activateLoginView', false, true); 
		}
  });
}

function showLoginView(event)
{
  prepareLoginViewForDevice();
	addBackHistory("showLoginView();");
  setMainLabel('Login');
  var loginUrl = siteVars.serverAppPath + '/util/DoLogin.php';
  ajaxQueue.add({
		type: 'GET',
		cache: "false",
		url: loginUrl,
		complete: function(xhr, textstatus) { // readystate == 4
			var loginBox = document.getElementById('loginBox');
			if (isAJAXError(textstatus) || xhr.status !== 200)
			{
				insertText(loginBox, 'Unable to contact server.');
			}
			else
			{
				insertHTML(loginBox, xhr.responseText);
			}
			setCurrentView('loginView', false, true); 
		}
  });
}

function updateLoginBar(){
	var loginStatus = document.getElementById('loginStatus');
	var requestUrl = siteVars.serverAppPath + '/util/GetLogin.php';
	$('body').trigger('taskBegun');
	ajaxQueue.add({
		url: requestUrl,
		dataType: 'json',
		complete: function(xhr, xhrStatus) {
			$('body').trigger('taskComplete');
			if (isAJAXError(xhrStatus) || xhr.status !== 200) { return; }
			var data = JSON.parse(xhr.responseText);
			if (data !== null)
			{
				if (data.status == "LOGGED IN")
				{
					if (data.html.length > 0)
					{
						insertHTML(loginStatus, data.html);
						$(loginStatus).removeClass('hidden');
					}
					else
					{
						$('#logoutButton').removeClass('hidden');
					}
					$('#loginButton').addClass('hidden');
				}
				else
				{
					$('#loginStatus, #logoutButton').addClass('hidden');
					$('#loginButton').removeClass('hidden');
				}
				if (currentCategory !== undefined)
				{
					populateKeywordList(currentCategory);
				}
			}
		},
		timeout: computeTimeout(500)
	});
}

function submitLogin()
{
	var loginUrl = siteVars.serverAppPath + '/util/DoLogin.php';
  var requestData = "action=login&mobile_number=" + document.getElementById('mobile_number').value + "&password=" + document.getElementById('password').value;
	MyAnswers.log("iPhoneLogin transaction: " + loginUrl + "?" + requestData);
	$('body').trigger('taskBegun');
  ajaxQueue.add({
		type: 'GET',
		cache: "false",
		url: loginUrl,
		data: requestData,
		complete: function(xhr, textstatus) { // readystate == 4
			var loginBox = document.getElementById('loginBox');
			$('body').trigger('taskComplete');
			if (isAJAXError(textstatus) || xhr.status !== 200)
			{
				insertText(loginBox, 'Unable to contact server.');
			}
			else
			{
				insertHTML(loginBox, xhr.responseText);
			}
			setCurrentView('loginView', false, true); 
			$('body').trigger('taskComplete');
			getSiteConfig();
			updateLoginBar();
		}
  });
}

function submitLogout()
{
  var loginUrl = siteVars.serverAppPath + '/util/DoLogin.php';
  var requestData = 'action=logout';
  ajaxQueue.add({
		type: 'GET',
		cache: "false",
		url: loginUrl,
		data: requestData,
		complete: function(xhr, textstatus) { // readystate == 4
			MyAnswers.log("iPhoneLogin transaction complete: " + textstatus);
			var loginBox = document.getElementById('loginBox');
			if (isAJAXError(textstatus) || xhr.status !== 200)
			{
				insertText(loginBox, 'Unable to contact server.');
			}
			else
			{
				insertHTML(loginBox, xhr.responseText);
			}
			setCurrentView('loginView', false, true); 
			getSiteConfig();
			updateLoginBar();
		}
  });
}

function goBackToTopLevelAnswerView(event)
{
	prepareAnswerViewForDevice();
  MyAnswers.log('goBackToTopLevelAnswerView()');
  setCurrentView('answerView', true, true);
}

function queuePendingFormData(str, arrayAsString, method, uuid) {
  if (getAnswerSpaceItem("_pendingFormDataString")) {
    setAnswerSpaceItem("_pendingFormDataString", getAnswerSpaceItem("_pendingFormDataString") + ":" + str);
    setAnswerSpaceItem("_pendingFormDataArrayAsString", getAnswerSpaceItem("_pendingFormDataArrayAsString") + ":" + encodeURIComponent(arrayAsString));
    setAnswerSpaceItem("_pendingFormMethod", getAnswerSpaceItem("_pendingFormMethod") + ":" + encodeURIComponent(method));
    setAnswerSpaceItem("_pendingFormUUID", getAnswerSpaceItem("_pendingFormUUID") + ":" + encodeURIComponent(uuid));
  } else {
    setAnswerSpaceItem("_pendingFormDataString", str);
    setAnswerSpaceItem("_pendingFormDataArrayAsString", encodeURIComponent(arrayAsString));
    setAnswerSpaceItem("_pendingFormMethod", encodeURIComponent(method));
    setAnswerSpaceItem("_pendingFormUUID", encodeURIComponent(uuid));
  }
}

function submitFormWithRetry() {    
  var str;
  var arr;
  var method;
  var uuid;
  var localKeyword;

  if (checkFormRetryData()) {
	 MyAnswers.log("submitFormWithRetry(1a): ");
	 var qx = headPendingFormData();
	 str = qx[0];
	 arr = qx[1].split("/");
	 method = qx[2];
	 uuid = qx[3];
  } else {
	 MyAnswers.log("submitFormWithRetry(1b): ");
	 return;
  }

  var answerUrl = siteVars.serverAppPath + '/util/GetAnswer.php?';
  if (arr[0] == "..") {
	 answerUrl += "answerSpace=" + siteVars.answerSpace + "&keyword=" + encodeURIComponent(arr[1]) + '&_device=' + deviceVars.device + (arr[2].length > 1 ? "&" + arr[2].substring(1) : "");
	 localKeyword = arr[1];
  } else {
	 answerUrl += "answerSpace=" + arr[1] + "&keyword=" + encodeURIComponent(arr[2]) + '&_device=' + deviceVars.device;
	 localKeyword = arr[2];
  }

	var currentBox = $('.view:visible > .box');
	var requestData;
	if (method == 'get')
	{
		method = 'GET';
		requestData = '&' + str;
	}
	else
	{
		method = 'POST';
		requestData = str;
	}

	$('body').trigger('taskBegun');
	ajaxQueue.add({
		type: method,
		cache: 'false',
		url: answerUrl,
		data: requestData,
		complete: function(xhr, textstatus) { // readystate == 4
			var html;
			if (isAJAXError(textstatus) || xhr.status !== 200)
			{
				html = 'Unable to contact server. Your submission has been stored for future attempts.';
			}
			else
			{
				delHeadPendingFormData();
				html = xhr.responseText;
			}
			if (currentBox.attr('id').indexOf('answerBox') !== -1)
			{
				currentBox.hide('slide', { direction: 'left'}, 300, function() {
					insertHTML(currentBox[0], html);
					currentBox.show('slide', { direction: 'right'}, 300);
					window.scrollTo(0, 1);
				});
				setTimeout(function() {
					onScroll();
				}, 350);
			}
			else
			{
				var answerBox2 = document.getElementById('answerBox2');
				prepareSecondLevelAnswerViewForDevice();
				addBackHistory("");
				insertHTML(answerBox2, html);
				setCurrentView('answerView2', false, true);   
			}
			setSubmitCachedFormButton();
			$('body').trigger('taskComplete');
		},
		timeout: computeTimeout(answerUrl.length + requestData.length)
	});
}

function submitForm() {
  var str = '';
	var form = $('.view:visible').find('form').first();
  form.find('input, textarea, select').each(function(index, element) {
    if (element.name)
    {
      if (element.type && (element.type.toLowerCase() === 'radio' || element.type.toLowerCase() === 'checkbox') && element.checked === false)
      {
        $.noop(); // do nothing for unchecked radio or checkbox
      }
      else
      {
        if (element.type && (element.type.toLowerCase() === 'button') && (lastPictureTaken.image.size() > 0))
        {
          if (lastPictureTaken.image.containsKey(element.name))
          {
            str += "&" + element.name + "=" + encodeURIComponent(lastPictureTaken.image.get(element.name));
            //MyAnswers.log("if: " + str);
          }
        }
        else
        {
          if (element.type && (element.type.toLowerCase() == "button"))
          {
            if ((element.value !== "Gallery") && (element.value != "Camera"))
            { 
              str += "&" + element.name + "=" + element.value;
            }
            else
            {
              str += "&" + element.name + "=";
            }
          }
          else
          {
						str += "&" + element.name + "=" + element.value;
          }
          //MyAnswers.log("else: " + str);
        }
      }
    }
  });
  MyAnswers.log("lastPictureTaken.image.size() = " + lastPictureTaken.image.size());
  lastPictureTaken.image.clear();

  //var str = $('form').first().find('input, textarea, select').serialize();
  MyAnswers.log("submitForm(2): " + document.forms[0].action);
  //MyAnswers.log("submitForm(2a): " + str);
  queuePendingFormData(str, document.forms[0].action, document.forms[0].method.toLowerCase(), Math.uuid());
  submitFormWithRetry();
}

function submitAction(keyword, action) {
	MyAnswers.log('submitAction(): keyword=' + keyword + ' action=' + action);
	var currentBox = $('.view:visible > .box');
	var form = currentBox.find('form').first();
	var sessionInput = form.find('input[name=blink_session_data]');
	var formData = (action == 'cancel=Cancel') ? '' : form.find('input, textarea, select').serialize();
	var method = form.attr('method');
	if (sessionInput.size() === 1 && ! $.isEmptyObject(starsProfile))
	{
		var serializedProfile = '{"stars":' + JSON.stringify(starsProfile) + '}';
		formData = formData.replace('blink_session_data=', 'blink_session_data=' + encodeURIComponent(serializedProfile));
		method = 'post';
	}

	var requestData, requestUrl;
	if (method == 'get')
	{
		method = 'GET';
		requestUrl = siteVars.serverAppPath + '/util/GetAnswer.php?answerSpace=' + siteVars.answerSpace + "&keyword=" + keyword + '&_device=' + deviceVars.device;
		requestData = '&' + formData + (typeof(action) === 'string' && action.length > 0 ? '&' + action : '');
	}
	else
	{
		method = 'POST';
		requestUrl = siteVars.serverAppPath + '/util/GetAnswer.php?answerSpace=' + siteVars.answerSpace + "&keyword=" + keyword + '&_device=' + deviceVars.device + (typeof(action) === 'string' && action.length > 0 ? '&' + action : '');
		requestData = formData;
	}

	$('body').trigger('taskBegun');
	ajaxQueue.add({
		type: method,
		cache: 'false',
		url: requestUrl,
		data: requestData,
		complete: function(xhr, textstatus) { // readystate == 4
			$('body').trigger('taskComplete');
			var html;
			if (isAJAXError(textstatus) || xhr.status !== 200)
			{
				html = 'Unable to contact server.';
			}
			else
			{
				html = xhr.responseText;
			}
			if (currentBox.attr('id').indexOf('answerBox') !== -1)
			{
				currentBox.hide('slide', { direction: 'left'}, 300, function() {
					insertHTML(currentBox[0], html);
					currentBox.show('slide', { direction: 'right'}, 300);
					window.scrollTo(0, 1);
					onScroll();
					$('body').trigger('answerDownloaded', [$(currentBox).parent().attr('id')]);
				});
			}
			else
			{
				var answerBox2 = document.getElementById('answerBox2');
				prepareSecondLevelAnswerViewForDevice();
				addBackHistory("");
				insertHTML(answerBox2, html);
				setCurrentView('answerView2', false, true);   
				$('body').trigger('answerDownloaded', ['answerView2']);
			}
		},
		timeout: computeTimeout(requestUrl.length + requestData.length)
	});
}

function isLocationAvailable()
{
	if (typeof(navigator.geolocation) != 'undefined')
	{
		return true;
	}
	else if (typeof(google) != 'undefined' && typeof(google.gears) != 'undefined')
	{
		return google.gears.factory.getPermission(siteVars.answerSpace, 'See your location marked on maps.');
	}
	return false;
}

function startTrackingLocation()
{
	if (locationTracker === null)
	{
		if (typeof(navigator.geolocation) != 'undefined')
		{
			navigator.geolocation.watchPosition(function(position) {
				if (latitude != position.coords.latitude || longitude != position.coords.longitude)
				{
					latitude = position.coords.latitude;
					longitude = position.coords.longitude;
					MyAnswers.log('Location Event: Updated', latitude, longitude);
					$('body').trigger('locationUpdated');
				}
			}, null, { enableHighAccuracy : true, maximumAge : 600000 });
		}
		else if (typeof(google) != 'undefined' && typeof(google.gears) != 'undefined')
		{
			google.gears.factory.create('beta.geolocation').watchPosition(function(position) {
				if (latitude != position.latitude || longitude != position.longitude)
				{
					latitude = position.latitude;
					longitude = position.longitude;
					MyAnswers.log('Location Event: Updated', latitude, longitude);
					$('body').trigger('locationUpdated');
				}
			}, null, { enableHighAccuracy : true, maximumAge : 600000 });
		}
	}
}

function stopTrackingLocation()
{
	if (locationTracker !== null)
	{
		if (typeof(navigator.geolocation) != 'undefined')
		{
			navigator.geolocation.clearWatch(locationTracker);
		}
		else if (typeof(google) != 'undefined' && typeof(google.gears) != 'undefined')
		{
			google.gears.factory.create('beta.geolocation').clearWatch(locationTracker);
		}
		locationTracker = null;
	}
}

function setupGoogleMapsBasic(element, data, map)
{
	MyAnswers.log('Google Maps Basic: initialising', data);
	$('body').trigger('taskBegun');
	var location = new google.maps.LatLng(data.latitude, data.longitude);
	var options = {
		zoom: parseInt(data.zoom, 10),
		center: location,
		mapTypeId: google.maps.MapTypeId[data.type.toUpperCase()]
	};
	map.setOptions(options);
	/*
	google.maps.event.addListener(map, 'tilesloaded', stopInProgressAnimation);
	google.maps.event.addListener(map, 'zoom_changed', startInProgressAnimation);
	google.maps.event.addListener(map, 'maptypeid_changed', startInProgressAnimation);
	google.maps.event.addListener(map, 'projection_changed', startInProgressAnimation);
	*/
	if (typeof(data.kml) === 'string')
	{
		var kml = new google.maps.KmlLayer(data.kml, { map: map, preserveViewport: true });
	}
	else if (typeof(data.marker) === 'string')
	{
		var marker = new google.maps.Marker({
			position: location,
			map: map,
			icon: data.marker
		});
		if (typeof(data['marker-title']) === 'string')
		{
			marker.setTitle(data['marker-title']);
			var markerInfo = new google.maps.InfoWindow();
			google.maps.event.addListener(marker, 'click', function() {
				markerInfo.setContent(marker.getTitle());
				markerInfo.open(map, marker);
			});
		}
	}
	$('body').trigger('taskComplete');
}

function setupGoogleMapsDirections(element, data, map)
{
	MyAnswers.log('Google Maps Directions: initialising', data);
	$('body').trigger('taskBegun');
	var origin, destination, language, region, geocoder;
	if (typeof(data['origin-address']) === 'string')
	{
		origin = data['origin-address'];
	}
	else if (typeof(data['origin-latitude']) !== 'undefined')
	{
		origin = new google.maps.LatLng(data['origin-latitude'], data['origin-longitude']);
	}
	if (typeof(data['destination-address']) === 'string')
	{
		destination = data['destination-address'];
	}
	else if (typeof(data['destination-latitude']) !== 'undefined')
	{
		destination = new google.maps.LatLng(data['destination-latitude'], data['destination-longitude']);
	}
	if (typeof(data.language) === 'string')
	{
		language = data.language;
	}
	if (typeof(data.region) === 'string')
	{
		region = data.region;
	}
	if (origin === undefined && destination !== undefined)
	{
		MyAnswers.log('Google Maps Directions: missing origin', destination);
		if (isLocationAvailable())
		{
			insertText($(element).next('.googledirections')[0], 'Attempting to use your most recent location as the origin.');
			setTimeout(function() {
				data['origin-latitude'] = latitude;
				data['origin-longitude'] = longitude;
				setupGoogleMapsDirections(element, data, map);
			}, 5000);
			return;
		}
		else if (typeof(destination) === 'object')
		{
			insertText($(element).next('.googledirections')[0], 'Missing origin. Only the provided destination is displayed.');
			data.latitude = destination.lat();
			data.longitude = destination.lng();
			setupGoogleMapsBasic(element, data, map);
			return;
		}
		else
		{
			insertText($(element).next('.googledirections')[0], 'Missing origin. Only the provided destination is displayed.');
			geocoder = new google.maps.Geocoder();
			geocoder.geocode({
					address: destination,
					region: region,
					language: language
				}, function(result, status) {
				if (status != google.maps.GeocoderStatus.OK)
				{
					insertText($(element).next('.googledirections')[0], 'Missing origin and unable to locate the destination.');
				}
				else
				{
					data.zoom = 15;
					data.latitude = result[0].geometry.location.b;
					data.longitude = result[0].geometry.location.c;
					setupGoogleMapsBasic(element, data, map);
				}
			});
			return;
		}
	}
	if (origin !== undefined && destination === undefined)
	{
		MyAnswers.log('Google Maps Directions: missing destination', origin);
		if (isLocationAvailable())
		{
			insertText($(element).next('.googledirections')[0], 'Attempting to use your most recent location as the destination.');
			setTimeout(function() {
				data['destination-latitude'] = latitude;
				data['destination-longitude'] = longitude;
				setupGoogleMapsDirections(element, data, map);
			}, 5000);
			return;
		}
		else if (typeof(origin) === 'object')
		{
			insertText($(element).next('.googledirections')[0], 'Missing destination. Only the provided origin is displayed.');
			data.latitude = origin.lat();
			data.longitude = origin.lng();
			setupGoogleMapsBasic(element, data, map);
			return;
		}
		else
		{
			insertText($(element).next('.googledirections')[0], 'Missing destination. Only the provided origin is displayed.');
			geocoder = new google.maps.Geocoder();
			geocoder.geocode({ 
					address: origin,
					region: region,
					language: language
				}, function(result, status) {
				if (status != google.maps.GeocoderStatus.OK)
				{
					insertText($(element).next('.googledirections')[0], 'Missing destination and unable to locate the origin.');
				}
				else
				{
					data.zoom = 15;
					data.latitude = result[0].geometry.location.b;
					data.longitude = result[0].geometry.location.c;
					setupGoogleMapsBasic(element, data, map);
				}
			});
			return;
		}
	}
	MyAnswers.log('Google Maps Directions: both origin and destination provided', origin, destination);
	var directionsOptions = {
		origin: origin,
		destination: destination,
		travelMode: google.maps.DirectionsTravelMode[data.travelmode.toUpperCase()],
		avoidHighways: data.avoidhighways,
		avoidTolls: data.avoidtolls,
		region: region
	};
	var mapOptions = {
		mapTypeId: google.maps.MapTypeId[data.type.toUpperCase()]
	};
	map.setOptions(mapOptions);
	var directionsDisplay = new google.maps.DirectionsRenderer();
	directionsDisplay.setMap(map);
	directionsDisplay.setPanel($(element).next('.googledirections')[0]);
	var directionsService = new google.maps.DirectionsService();
	directionsService.route(directionsOptions, function(result, status) {
		if (status == google.maps.DirectionsStatus.OK)
		{
			directionsDisplay.setDirections(result);
		}
		else
		{
			insertText($(element).next('.googledirections')[0], 'Unable to provide directions: ' + status);
		}
	});
	$('body').trigger('taskComplete');
}

function setupGoogleMaps()
{
	$('body').trigger('taskBegun');
	$('div.googlemap').each(function(index, element) {
		var googleMap = new google.maps.Map(element);
		var data = $(element).data();
		if (data.sensor === true && isLocationAvailable())
		{
			startTrackingLocation();
		}
		if ($(element).data('map-action') === 'directions')
		{
			setupGoogleMapsDirections(element, data, googleMap);
		}
		else
		{
			setupGoogleMapsBasic(element, data, googleMap);
		}
		if (isLocationAvailable())
		{
			var currentMarker = new google.maps.Marker({
				map: googleMap,
				icon: siteVars.serverAppPath + '/images/location24.png',
				title: 'Your current location'
			});
			if (latitude && longitude)
			{
				currentMarker.setPosition(new google.maps.LatLng(latitude, longitude));
			}
			$('body').bind('locationUpdated', function() {
				currentMarker.setPosition(new google.maps.LatLng(latitude, longitude));
			});
			var currentInfo = new google.maps.InfoWindow();
			google.maps.event.addListener(currentMarker, 'click', function() {
				currentInfo.setContent(currentMarker.getTitle());
				currentInfo.open(googleMap, currentMarker);
			});
		}
	});
	$('body').trigger('taskComplete');
}

// *** BEGIN APPLICATION INIT ***

function onBrowserReady() {
  MyAnswers.log("onBrowserReady: " + window.location);
  try {
		var uriParts = parse_url(window.location);
		var splitUrl = uriParts.path.match(/_R_\/(.+)\/(.+)\/index\.php/);
		MyAnswers.loadURL = uriParts.scheme + '://' + uriParts.host + '/_R_/';
		siteVars.serverAppVersion =  splitUrl[2];
		siteVars.serverDomain = uriParts.host;
		siteVars.serverAppPath = uriParts.scheme + '://' + siteVars.serverDomain + '/_R_/common/' + siteVars.serverAppVersion;
		siteVars.serverDevicePath = uriParts.scheme + '://' + siteVars.serverDomain + '/_R_/' + deviceVars.device + '/' + siteVars.serverAppVersion;
		siteVars.queryParameters = getURLParameters();
		siteVars.answerSpace = siteVars.queryParameters.answerSpace;
		delete siteVars.queryParameters.uid;
		delete siteVars.queryParameters.answerSpace;
		MyAnswers.domain = uriParts.scheme + '://' + siteVars.serverDomain + "/";
		
		if (document.getElementById('loginButton') !== null)
		{
			siteVars.hasLogin = true;
		}
	
		// 
		// The following variables are initialised here so the JS can be tested within Safari
		//
		MyAnswers.cameraPresent = false;
		MyAnswers.multiTasking = false;
		//
		// End of device overriden variables
		//
		
		// HTML5 Web Worker
		deviceVars.hasWebWorkers = typeof(window.Worker) === 'function'; 
		if (deviceVars.hasWebWorkers === true)
		{
			MyAnswers.webworker = new Worker(siteVars.serverAppPath + '/webworker.js');
			MyAnswers.webworker.onmessage = function(event) {
				switch (event.data.fn)
				{
					case 'log':
						MyAnswers.log(event.data.string);
						break;
					case 'processXSLT':
						MyAnswers.log('WebWorker: finished processing XSLT');
						var target = document.getElementById(event.data.target);
						insertHTML(target, event.data.html);
						break;
					case 'workBegun':
						$('body').trigger('taskBegun');
						break;
					case 'workComplete':
						$('body').trigger('taskComplete');
						break;
				}
			};
		}
		$(document).ajaxSend(function(event, xhr, options) {
				/*
				xhr.onprogress = function(e) {
					var string = 'AJAX progress: ' + phpName;
					MyAnswers.log(string + ' ' + e.position + ' ' + e.total + ' ' + xhr + ' ' + options);
				}
				*/
				MyAnswers.log('AJAX start: ' + options.url);
		});
		$(document).ajaxSuccess(function(event, xhr, options) {
				var status = typeof(xhr) === 'undefined' ? null : xhr.status;
				var readyState = typeof(xhr) === 'undefined' ? 4 : xhr.readyState;
				MyAnswers.log('AJAX complete: ' + options.url + ' ' + readyState + ' ' + status + ' ' + xhr + ' ' + options);
		});
		
		$(document).ajaxError(function(event, xhr, options, error) {
				MyAnswers.log('AJAX error: ' + options.url + ' ' + xhr + ' ' + options + ' ' + error);
		});
		MyAnswers.browserReady_Loaded = true;
  } catch(e) {
		MyAnswers.log("onBrowserReady: Exception");
		MyAnswers.log(e);
	}
}

// Function: loaded()
// Called by Window's load event when the web application is ready to start
//
function loaded()
{
	MyAnswers.log('loaded(): caller=' + loaded.caller.name);

  if (typeof(webappCache) !== 'undefined')
  {
		switch(webappCache.status)
		{
			case 0:
				MyAnswers.log("Cache status: Uncached"); break;
			case 1:
				MyAnswers.log("Cache status: Idle"); break;
			case 2:
				MyAnswers.log("Cache status: Checking"); break;
			case 3:
				MyAnswers.log("Cache status: Downloading"); break;
			case 4:
				MyAnswers.log("Cache status: Updateready"); break;
			case 5:
				MyAnswers.log("Cache status: Obsolete"); break;
		}
	}
		
	try {
/*	if (siteVars.answerSpace)
	{ */
		backStack = [];
		if (getAnswerSpaceItem('answerSpace') == 'undefined' || getAnswerSpaceItem('answerSpace') != siteVars.answerSpace) { clearStorage(); }
		setAnswerSpaceItem('answerSpace', siteVars.answerSpace);
		var message = getAnswerSpaceItem('siteConfigMessage');
		if (typeof(message) === 'string')
		{
			message = JSON.parse(message);
		}
		if (typeof(message) === 'object')
		{
			siteConfig = message.siteConfig;
			siteConfigHash = message.siteHash;
		}
		starsProfile = getAnswerSpaceItem('starsProfile');
		if (typeof(starsProfile) === 'string')
		{
			starsProfile = JSON.parse(starsProfile);
		}
		if (typeof(starsProfile) !== 'object')
		{
			starsProfile = { };
		}
		setSubmitCachedFormButton();
		getSiteConfig();
		updateLoginBar();
	/* }
	else
	{
		getAnswerSpacesList();
	}*/
	} catch(e) {
		MyAnswers.log("Exception loaded: ");
		MyAnswers.log(e);
	}
}

function init_main() {
	MyAnswers.log("init_main(): ");

	hasCategories = false;
	hasMasterCategories = false;
	hasVisualCategories = false;
	answerSpaceOneKeyword = false;

	PictureSourceType.PHOTO_LIBRARY = 0;
	PictureSourceType.CAMERA = 1;
  lastPictureTaken.image = new Hashtable();
  lastPictureTaken.currentName = null;

	jQuery.fx.interval = 25; // default is 13, increasing this to be kinder on devices
	
	lowestTransferRateConst = 1000 / (4800 / 8);
	maxTransactionTimeout = 180 * 1000;
	ajaxQueue = $.manageAjax.create('globalAjaxQueue', { queue: true });
	ajaxQueueMoJO = $.manageAjax.create('mojoAjaxQueue', { queue: true });

	MyAnswers.runningTasks = 0; // track the number of tasks in progress
	
	// TODO JSLint doesn't like the regular expression below ??? unescaped & [ -
	// to facilitate building regex replacements
	RegExp.quote = function(str) { return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1"); };

	addEvent(document, 'orientationChanged', updateOrientation);
	addEvent(window, 'scroll', onScroll);
	$(window).trigger('scroll');
		
	$('body').bind('answerDownloaded', onAnswerDownloaded);
	$('body').bind('transitionComplete', onTransitionComplete);

	//dumpLocalStorage();
//
// Do fiddle faddle to get jStore initialised
//
	jStore.init(siteVars.answerSpace, {});
	jStore.error(function(e) { MyAnswers.log('jStore: ' + e); });

	deviceVars.storageReady = false;
  var storageEngineCheck = setInterval(function() {
    MyAnswers.log("jStore: storageEngineCheck");
    if (deviceVars.storageReady === true) {
      MyAnswers.log('jStore storageReady: ' + deviceVars.storageReady);
      setTimeout(function() { 
        try {
          MyAnswers.log('jStore storageReady: running loaded(): ' + jStore.activeEngine().jri);
          loaded(); 
          MyAnswers.log('jStore storageReady: loaded() returned');
        } catch(e) {
          MyAnswers.log("jStore storageReady exception: ");
          MyAnswers.log(e);
        }
      }, 1000);
      clearInterval(storageEngineCheck);
    }
    deviceVars.storageReady = jStore.activeEngine().isReady;
  }, 100);	
  
  MyAnswers.activityIndicator = document.getElementById('activityIndicator');
  MyAnswers.activityIndicatorTimer = null;
  
  $('body').bind('taskBegun', onTaskBegun);
  $('body').bind('taskComplete', onTaskComplete);
  $('body').bind('siteBootComplete', onSiteBootComplete);
}

function onBodyLoad() {
  if (navigator.userAgent.search("Safari") > 0) {
    MyAnswers.log("onBodyLoad: direct call to onBrowserReady()");
    onBrowserReady();
  } else {
		var bodyLoadedCheck = setInterval(function() {
			if (MyAnswers.bodyLoaded) {
				clearInterval(bodyLoadedCheck);
				onBrowserReady();
			} else {
				MyAnswers.log("Waiting for onload event...");
			}
		}, 1000);
    setTimeout(function() {
      MyAnswers.bodyLoaded = true;
      MyAnswers.log("onBodyLoad: set bodyLoaded => true");
    }, 2000);
  }
}
if (!addEvent(window, "load", onBodyLoad)) {
  alert("Unable to add load handler");
  throw("Unable to add load handler");
}

(function() {
  var waitJSLoaded = setInterval(function() {
    if (MyAnswers.main_Loaded && MyAnswers.device_Loaded && MyAnswers.browserReady_Loaded) {
      clearInterval(waitJSLoaded);
      MyAnswers.log("onBrowserReady: running JS init");
      try {
				init_device();
				init_main();
      } catch(e) {
				MyAnswers.log("onBrowserReady: Exception");
				MyAnswers.log(e);
      }
			MyAnswers.log("User-Agent: " + navigator.userAgent);
	  }
  }, 500);
})();

// END APPLICATION INIT

MyAnswers.main_Loaded = true;
