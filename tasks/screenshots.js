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
var fs = Promise.promisifyAll( require("fs") );
var mkdirp = require( "mkdirp" );
var path = require( "path" );
var util = require( "util" );
var handlebars = require( "handlebars" );

module.exports = function( grunt ) {

	grunt.registerMultiTask( "screenshots", "Take multiple screenshots of a local site via BrowserStack", function() {
		
		var tunnel;

		// Set some defaults as well
		var options = this.options( {
			reportDir: "tmp",
			local: true,
			launchTunnel: true,
			projectTitle: ""
		} );

		var apiRoot = "https://www.browserstack.com";

		var	endTask = this.async();

		var jobs = [];

		var doneScreenshots = [];
		var requiredScreenshots = 0;

		var progressBar;

		function Job( route, id, screenshots ) {

			function generateName( route ) {

				// If empty or slash => index
				// If /faq => faq
				// If /blog/blog-post => blog_blog-post

				if ( route === "/" || route === "" ) {
					return "index";
				}

				if ( ( route.match( /\//g ) || [] ).length > 1 ) {
					// More than one forward-slash ie. has a complex path
					var components = route.split( "/" );
					var name = "";

					for ( var i = 1; i < components.length; i++ ) {

						if ( i === components.length - 1 ) { 
							name += components[ i ];
						} else {
							name += components[ i ] + "_";
						}

					};

					return name;

				}

				// Still here
				return route.replace( "/", "" );

			};

			this.name = generateName( route );
			this.id = id;
			this.screenshots = screenshots;
			this.done = false;

			this.firstToUpperCase = function( str ) { 
    			return str.substr( 0, 1 ).toUpperCase() + str.substr( 1 );
			};

		};

		var baseRequest = request.defaults( {
			json: true,
			encoding: "utf8",
			baseUrl: apiRoot,
			auth: {
				user: options.bsUser,
				password: options.bsKey
			}
		} );

		var launchTunnel = function( callback ) {

			if ( options.launchTunnel !== true ) {
				callback();
				return;
			}

			tunnel = new BsTunnel( {
				key: options.bsKey,
				force: true // Kill any existing tunnels
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

			} else {
				endTask();
			}

		};

		var createJob = function( route ) {
		
			return baseRequest( {
				url: "/screenshots",
				method: "POST",
				json: {
					url: options.baseUrl + route,
					browsers: options.browsers,
					local: options.local,
					wait_time: options.wait_time
				}
			} ).then( function(response) {
				jobs.push( new Job( route, response.job_id, response.screenshots ) );
				return response;
			} ).catch( function(error) {
				console.log(error);
				console.dir(error);
			} );

		};

		var getJob = function( jobID ) {

			return baseRequest( {
				url: "/screenshots/" + jobID + ".json",
				method: "GET"
			} ).catch( function(error) {
				grunt.log.errorlns( "Getjob request failed" );
				grunt.log.errorlns( error );
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
					grunt.log.errorlns( "Job timeout: " + job.id );
					return;
				}

				return getJob( job.id ).then( function( jobUpdate ) {

					job.screenshots = jobUpdate.screenshots;

					updateProgress( jobUpdate.screenshots );

					if ( jobUpdate.state === "done" ) {
						job.done = true;
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

		var reportLocal = function() {

			var template = fs.readFileSync( path.join( __dirname, "/lib", "screenshots.hbs"), "utf8" );
			var templateCompiled = handlebars.compile( template );

			for ( var i = 0; i < jobs.length; i++ ) {
				jobs[ i ].name = jobs[ i ].firstToUpperCase( jobs[ i ].name );
				jobs[ i ].url = util.format( "%s/screenshots/%s", apiRoot, jobs[ i ].id );
			}

			var html = templateCompiled( { projectTitle: options.projectTitle, jobs: jobs } );

			mkdirp.sync( path.join( options.reportDir ) );

			return fs.writeFileAsync( path.join( options.reportDir, "screenshots.html" ), html, { encoding: "utf8" } );

		};

		var reportSlack = function() {

			var slackPost = {
				username: "BrowserStack Screenshots",
				text: util.format( "Cross-browser screenshots of the latest *%s* build have been generated.\nClick on a page name to see the screenshots.", options.projectTitle ),
				attachments: []
			};

			var generateJobLink = function( jobName, jobID ) {

				var jobUrl = util.format( "%s/screenshots/%s", apiRoot, jobID );
				return util.format( "<%s|%s>", jobUrl, firstToUpperCase( jobName ) );

			};

			var report = {
				text: "",
				color: "good",
				mrkdwn_in: [ "text" ]
			};

			for ( var i = 0; i < jobs.length; i++ ) {

				if ( i === jobs.length - 1 ) {
					// Last one
					report.text += generateJobLink( jobs[ i ].name, jobs[ i ].id );
				} else {
					report.text += generateJobLink( jobs[ i ].name, jobs[ i ].id ) + " / ";
				}
		
			}

			slackPost.attachments.push( report );

			return request( {
				method: "POST",
				url: options.slackWebhook,
				json: slackPost
			} );

		};

		launchTunnel( function() {

			createJobs().then(function() {

				pollJobs().then(function() {

					if ( typeof options.reportDir === "string" && typeof options.slackWebhook === "undefined" ) {
						
						return reportLocal().then( function() {
							grunt.log.ok( "Successfully generated local report." );
						} );

					} else if ( typeof options.slackWebhook === "string" ) {

						return reportSlack().then( function() {
							grunt.log.ok( "Successfully posted a Slack report." );
						} );

					}

				}).then(function() {

					grunt.log.ok( "Closing tunnel..." );
					closeTunnel();

				});

			});

		} );

	} );

};