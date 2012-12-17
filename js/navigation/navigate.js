//>>excludeStart("jqmBuildExclude", pragmas.jqmBuildExclude);
//>>description: placeholder
//>>label: AJAX Navigation System
//>>group: Navigation
define([
	"jquery",
	"./../jquery.mobile.core",
	"./../jquery.mobile.support",
	"./events/navigate",
	"./path" ], function( $ ) {
//>>excludeEnd("jqmBuildExclude");

(function( $, undefined ) {
	var path = $.mobile.path, history;

	$.Navigator = function( history ) {
		this.history = history;
	};

  $.extend($.Navigator.prototype, {
    squash: function( url, data ) {
		  var state, href,
			  hash = path.isPath(url) ? path.stripHash(url) : url;

		  href = path.squash( url );

		  // make sure to provide this information when it isn't explicitly set in the
		  // data object that was passed to the squash method
		  state = $.extend({
			  hash: hash,
			  url: href
		  }, data);

		  // replace the current url with the new href and store the state
		  // Note that in some cases we might be replacing an url with the
		  // same url. We do this anyways because we need to make sure that
		  // all of our history entries have a state object associated with
		  // them. This allows us to work around the case where $.mobile.back()
		  // is called to transition from an external page to an embedded page.
		  // In that particular case, a hashchange event is *NOT* generated by the browser.
		  // Ensuring each history entry has a state object means that onPopState()
		  // will always trigger our hashchange callback even when a hashchange event
		  // is not fired.
		  window.history.replaceState( state, state.title || document.title, href );

		  return state;
	  },

	  go: function( url, data, noEvents ) {
		  var state, href, parsed, loc, hash, popstateEvent,
			  isPopStateEvent = $.event.special.navigate.isPushStateEnabled(),
			  resolutionUrl = path.isPath( url ) ? path.getLocation() : $.mobile.getDocumentUrl();

		  // Get the url as it would look squashed on to the current resolution url
		  href = path.squash( url );

		  // Grab the hash for recording. If the passed url is a path
		  // we used the parsed version of the squashed url to reconstruct,
		  // otherwise we assume it's a hash and store it directly
		  parsed = path.parseUrl( url );
		  loc = path.parseLocation();

		  if( loc.pathname + loc.search === parsed.pathname + parsed.search ) {
			  // If the pathname and search of the passed url is identical to the current loc
			  // then we must use the hash. Otherwise there will be no event
			  // eg, url = "/foo/bar?baz#bang", location.href = "http://example.com/foo/bar?baz"
			  hash = parsed.hash ? parsed.hash : parsed.pathname + parsed.search;
		  } else if ( path.isPath(url) ) {
			  var resolved = path.parseUrl( href );
			  // If the passed url is a path, make it domain relative and remove any trailing hash
			  hash = resolved.pathname + resolved.search + (path.isPreservableHash( resolved.hash )? resolved.hash.replace( "#", "" ) : "");
		  } else {
			  hash = url;
		  }

		  // Here we prevent the next hash change or popstate event from doing any
		  // history management. In the case of hashchange we don't swallow it
		  // if there will be no hashchange fired (since that won't reset the value)
		  // and will swallow the following hashchange
		  history.ignoreNextHashChange = true;
		  if( noEvents && hash !== path.stripHash(path.parseLocation().hash) ) {
			  history.preventNextHashChange = noEvents;
		  }

		  // IMPORTANT in the case where popstate is supported the event will be triggered
		  //           directly, stopping further execution - ie, interupting the flow of this
		  //           method call to fire bindings at this expression. Below the navigate method
		  //           there is a binding to catch this event and stop its propagation.
		  //
		  //           We then trigger a new popstate event on the window with a null state
		  //           so that the navigate events can conclude their work properly
		  //
		  // if the url is a path we want to preserve the query params that are available on
		  // the current url.
		  window.location.hash = hash;

		  state = $.extend({
			  url: href,
			  hash: hash,
			  title: document.title
		  }, data);

		  if( isPopStateEvent ) {
			  popstateEvent = new $.Event( "popstate" );
			  popstateEvent.originalEvent = {
				  type: "popstate",
				  state: null
			  };

			  this.squash( url, state );

			  // Trigger a new faux popstate event to replace the one that we
			  // caught that was triggered by the hash setting above.
			  if( !noEvents ) {
				  history.ignoreNextPopState = true;
				  $( window ).trigger( popstateEvent );
			  }
		  }

		  // record the history entry so that the information can be included
		  // in hashchange event driven navigate events in a similar fashion to
		  // the state that's provided by popstate
		  history.add( state.url, state );
	  }
  });

	// TODO replace singleton history object
	$.History = function() {
    this.stack = [];
    this.activeIndex = 0;
    this.initialDst = path.parseLocation().hash.replace( /^#/, "" );
	};

  $.extend($.History.prototype, {
		getActive: function() {
			return this.stack[ this.activeIndex ];
		},

		getLast: function() {
			return this.stack[ this.previousIndex ];
		},

		getNext: function() {
			return this.stack[ this.activeIndex + 1 ];
		},

		getPrev: function() {
			return this.stack[ this.activeIndex - 1 ];
		},

		// addNew is used whenever a new page is added
		add: function( url, data ){
			data = data || {};

			//if there's forward history, wipe it
			if ( this.getNext() ) {
				this.clearForward();
			}

			// if the hash is included in the data make sure the shape
			// is consistent for comparison
			if( data.hash && data.hash.indexOf( "#" ) === -1) {
				data.hash = "#" + data.hash;
			}

			data.url = url;
			this.stack.push( data );
			this.activeIndex = this.stack.length - 1;
		},

		//wipe urls ahead of active index
		clearForward: function() {
			this.stack = this.stack.slice( 0, this.activeIndex + 1 );
		},

		find: function( url, stack, earlyReturn ) {
			stack = stack || this.stack;

			var entry, i, length = stack.length, index;

			for ( i = 0; i < length; i++ ) {
				entry = stack[i];

				if ( decodeURIComponent(url) === decodeURIComponent(entry.url) ||
					decodeURIComponent(url) === decodeURIComponent(entry.hash) ) {
					index = i;

					if( earlyReturn ) {
						return index;
					}
				}
			}

			return index;
		},

		closest: function( url ) {
			var closest, a = this.activeIndex;

			// First, take the slice of the history stack before the current index and search
			// for a url match. If one is found, we'll avoid avoid looking through forward history
			// NOTE the preference for backward history movement is driven by the fact that
			//      most mobile browsers only have a dedicated back button, and users rarely use
			//      the forward button in desktop browser anyhow
			closest = this.find( url, this.stack.slice(0, a) );

			// If nothing was found in backward history check forward. The `true`
			// value passed as the third parameter causes the find method to break
			// on the first match in the forward history slice. The starting index
			// of the slice must then be added to the result to get the element index
			// in the original history stack :( :(
			//
			// TODO this is hyper confusing and should be cleaned up (ugh so bad)
			if( closest === undefined ) {
				closest = this.find( url, this.stack.slice(a), true );
				closest = closest === undefined ? closest : closest + a;
			}

			return closest;
		},

		direct: function( opts ) {
			var newActiveIndex = this.closest( opts.url ), a = this.activeIndex;

			// save new page index, null check to prevent falsey 0 result
			// record the previous index for reference
			if( newActiveIndex !== undefined ) {
				this.activeIndex = newActiveIndex;
				this.previousIndex = a;
			}

			// invoke callbacks where appropriate
			//
			// TODO this is also convoluted and confusing
			if ( newActiveIndex < a ) {
				( opts.present || opts.back || $.noop )( this.getActive(), 'back' );
			} else if ( newActiveIndex > a ) {
				( opts.present || opts.forward || $.noop )( this.getActive(), 'forward' );
			} else if ( newActiveIndex === undefined && opts.missing ){
				opts.missing( this.getActive() );
			}
		}
	});

	// TODO consider queueing navigation activity until previous activities have completed
	//      so that end users don't have to think about it. Punting for now
	// TODO !! move the event bindings into callbacks on the navigate event
	$.navigate = function( url, data, noEvents ) {
		$.navigate.navigator.go( url, data, noEvents );
	};

	// expose the history on the navigate method in anticipation of full integration with
	// existing navigation functionalty that is tightly coupled to the history information
	$.navigate.history = history = new $.History();

  // instantiate an instance of the navigator for use within the $.navigate method
	$.navigate.navigator = new $.Navigator( history );

	// This binding is intended to catch the popstate events that are fired
	// when execution of the `$.navigate` method stops at window.location.hash = url;
	// and completely prevent them from propagating. The popstate event will then be
	// retriggered after execution resumes
	//
	// TODO grab the original event here and use it for the synthetic event in the
	//      second half of the navigate execution that will follow this binding
	$( window ).bind( "popstate.history", function( event ) {
		var active, hash, state, closestIndex;

		// Partly to support our test suite which manually alters the support
		// value to test hashchange. Partly to prevent all around weirdness
		if( !$.event.special.navigate.isPushStateEnabled() ){
			return;
		}

		// If this is the popstate triggered by the actual alteration of the hash
		// prevent it completely to prevent handling
		if( history.ignoreNextHashChange ) {
			history.ignoreNextHashChange = false;
			event.stopImmediatePropagation();
			return;
		}

		// if this is the popstate triggered after the replaceState call in the navigate
		// method, then simply ignore it
		if( history.ignoreNextPopState ) {
			history.ignoreNextPopState = false;
			return;
		}

		// account for direct manipulation of the hash. That is, we will receive a popstate
		// when the hash is changed by assignment, and it won't have a state associated. We
		// then need to squash the hash. See below for handling of hash assignment that
		// matches an existing history entry
		if( !event.originalEvent.state ) {
			hash = path.parseLocation().hash;
			closestIndex = history.closest( hash );
			var index = history.activeIndex;
			active = history.getActive();

			// Avoid adding a history entry in two cases
			// 1) on the initial hashchange
			// 2) when the current history entry hash is identical to the
			//    current location hash
			if( history.stack.length !== 1 || hash !== history.getActive().hash ) {
				state = $.navigate.navigator.squash( hash );
				// TODO it might be better to only add to the history stack
				//      when the hash is adjacent to the active history entry

				// record the new hash as an additional history entry
				// to match the browser's treatment of hash assignment
				history.add( state.url, state );

				// pass the newly created state information
				// along with the event
				event.historyState = state;

				// do not alter history, we've added a new history entry
				// so we know where we are
				return;
			}
		}

		// If all else fails this is a popstate that comes from the back or forward buttons
		// make sure to set the state of our history stack properly, and record the directionality
		history.direct({
			url: (event.originalEvent.state || {}).url || hash,

			// When the url is either forward or backward in history include the entry
			// as data on the event object for merging as data in the navigate event
			present: function( historyEntry, direction ) {
				// make sure to create a new object to pass down as the navigate event data
				event.historyState = $.extend({}, historyEntry);
				event.historyState.direction = direction;
			}
		});
	});

	// NOTE must bind before `navigate` special event hashchange binding otherwise the
	//      navigation data won't be attached to the hashchange event in time for those
	//      bindings to attach it to the `navigate` special event
	// TODO add a check here that `hashchange.navigate` is bound already otherwise it's
	//      broken (exception?)
	$( window ).bind( "hashchange.history", function( event ) {
		var hash = path.parseLocation().hash;

		// If pushstate is supported the state will be included in the popstate event
		// data and appended to the navigate event. Late check here for late settings (eg tests)
		if( $.event.special.navigate.isPushStateEnabled() ) {
			return;
		}

		// On occasion explicitly want to prevent the next hash from propogating because we only
		// with to alter the url to represent the new state do so here
		if( history.preventNextHashChange ){
			history.preventNextHashChange = false;
			history.ignoreNextHashChange = false;
			event.stopImmediatePropagation();
			return;
		}

		// If the hashchange has been explicitly ignored or we have no history at
		// this point skip the history managment and the addition of the history
		// entry to the event for the `navigate` bindings
		if( history.ignoreNextHashChange ) {
			history.ignoreNextHashChange = false;
		}

		// If the stack is empty (it's been reset or some such) don't return,
		// we need to record it in the missing callback below.
		if( history.ignoreNextHashChange && history.stack.length > 0 ) {
			return;
		}

		// If this is a hashchange caused by the back or forward button
		// make sure to set the state of our history stack properly
		history.direct({
			url: hash,

			// When the url is either forward or backward in history include the entry
			// as data on the event object for merging as data in the navigate event
			present: function( historyEntry, direction ) {
				// make sure to create a new object to pass down as the navigate event data
				event.hashchangeState = $.extend({}, historyEntry);
				event.hashchangeState.direction = direction;
			},

			// When we don't find a hash in our history clearly we're aiming to go there
			// record the entry as new for future traversal
			//
			// NOTE it's not entirely clear that this is the right thing to do given that we
			//      can't know the users intention. It might be better to explicitly _not_
			//      support location.hash assignment in preference to $.navigate calls
			// TODO first arg to add should be the href, but it causes issues in identifying
			//      embeded pages
			missing: function() {
				history.add( hash, {
					hash: hash,
					title: document.title
				});
			}
		});
	});

	var loc = path.parseLocation();
	$.navigate.history.add( loc.href, {hash: loc.hash} );
})( jQuery );

//>>excludeStart("jqmBuildExclude", pragmas.jqmBuildExclude);
});
//>>excludeEnd("jqmBuildExclude");
