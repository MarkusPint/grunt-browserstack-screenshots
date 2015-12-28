/*
* grunt-browserstack-screenshots
* https://github.com/MarkusPint/grunt-browserstack-screenshots
*
* Copyright (c) 2015 Markus Pint
* Licensed under the MIT license.
*/

"use strict";

var BsTunnel = require( "browserstacktunnel-wrapper" );
var request = require( "request-promise" );
var Promise = require( "bluebird" );
var ProgressBar = require( "progress" );

module.exports = function( grunt ) {

	grunt.registerMultiTask( "screenshots", "Take multiple screenshots of a local site via BrowserStack", 

		function() {
		
		var tunnel;
		var options = this.options();
		var	endTask = this.async();

		var jobs = [];

		var doneScreenshots = [];
		var requiredScreenshots = 0;

		var progressBar;

		function Job( route, id, screenshots ) {

			if ( route === "/" || route === "" ) {
				this.name = "index";
			} else {
				this.name = route.replace( "/", "" );
			}

			this.id = id;
			this.screenshots = screenshots;
			this.done = false;

		};

		var baseRequest = request.defaults( {
			json: true,
			encoding: "utf8",
			baseUrl: "https://www.browserstack.com",
			auth: {
				user: options.bsUser,
				password: options.bsKey
			}
		} );

		var launchTunnel = function( callback ) {

			var isTunnelRequired = ( options.local === true );

			if ( !isTunnelRequired ) {
				callback();
				return;
			}

			tunnel = new BsTunnel( {
				key: options.bsKey,
				force: true // Kill any existing instances
			} );

			tunnel.start( function( error ) {

				if ( error ) {
					grunt.log.error( "Could not start tunnel" );
					grunt.log.error( error );
				} else {
					grunt.log.ok( "Started tunnel successfully" );
					callback();
				}

			} );

		};

		var closeTunnel = function() {

			if ( tunnel !== undefined ) {

				tunnel.stop( function( error ) {

					if ( error ) {
						grunt.log.errorlns( "Could not close tunnel(s) due to: " + error + "." );
					} else {
						grunt.log.ok( "Successfully closed tunnel!" );
						endTask();
					}

				} );

			}

		};

		var createJob = function( route ) {

			return baseRequest( {
				url: "/screenshots",
				method: "POST",
				json: {
					url: options.baseUrl + route,
					browsers: options.browsers,
					local: options.local
				}
			} ).then( function(response) {
				jobs.push( new Job( route, response.job_id, response.screenshots ) );
				return response;
			} );

		};

		var getJob = function( jobID ) {

			return baseRequest( {
				url: "/screenshots/" + jobID + ".json",
				method: "GET"
			} );

		};

		var updateProgress = function( screenshotsUpdate ) {

			for ( var i = 0; i < screenshotsUpdate.length; i++ ) {
				
				var found = false;

				for ( var j = 0; j < doneScreenshots.length; j++ ) {

					if ( screenshotsUpdate[i].id === doneScreenshots[j] ) {
						// Already saved to doneScreenshots
						found = true;
					}

				}

				if ( !found && screenshotsUpdate[i].state === "done" ) {
					doneScreenshots.push( screenshotsUpdate[i].id );
					progressBar.tick();
				}

			}

		};

		var pollJob = function( job ) {

			return ( function loop( value ) {

				if ( value === false ) { return; }

				if ( value > 10 ) { 
					console.log( "Job timeout: " + job.id );
					return;
				}

				return getJob( job.id ).then( function( jobUpdate ) {

					updateProgress( jobUpdate.screenshots );

					if ( jobUpdate.state === "done" ) {
						job.done = true;
						job.screenshots = jobUpdate.screenshots;
						return false;
					}

					return Promise.delay( 15000 ).then(function() {
						return value + 1;
					});

				} ).then( loop );

				return Promise.resolve( value );

			} )( 0 );

		};

		var pollJobs = function() {

			var pollJobs = [];

			for ( var i = 0; i < jobs.length; i++ ) {
				pollJobs.push( pollJob( jobs[i] ) );
			}

			return Promise.all( pollJobs );

		};

		var createJobs = function() {

			// Needs to create a screenshot request for each route
			// Need to ping each job periodically until success
			// Need to show screenshots progress in CLI

			requiredScreenshots = options.routes.length * options.browsers.length; 

			progressBar = new ProgressBar( "Polling screenshots: :bar", { total: requiredScreenshots, width: 100 } );
			// Force it to appear right away
			progressBar.tick( 0 );

			var jobPromises = [];

			for ( var i = 0; i < options.routes.length; i++ ) {
				jobPromises.push( createJob( options.routes[i] ) );
			}

			return Promise.all( jobPromises );

		};

		launchTunnel( function() {

			createJobs().then(function() {

				pollJobs().then(function() {

					// All jobs "done"
					// Need to either save screenshots in required folder or post URL-s to Slack

					console.log( "Closing tunnel..." );
					closeTunnel();
				});

			});

		} );

	} );

};