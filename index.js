#!/usr/bin/env node

var fs = require('fs');
var exec = require('child_process').exec
var _ = require('underscore');
var queue = require('queue-async');

var argv = require('optimist')
    .default('config', './settings.json')   // settings file.
    .default('frequency', '30')             // polling frequency.
    .default('out', false)                  // file to write to.
    .default('samples', false)              // number of times to poll.
    .argv;

try {
    var conf = require(argv.config);
}
catch (e) {
    console.log('Unable to load config >> ' + e.toString());
    process.exit(1);
}

var metric = function(settings) {
    this.history = [];
    _(this).defaults(settings);
    _(this).bindAll();
};

metric.prototype.run = function(unixtime, cb) {
    exec(this.command, function (error, stdout, stderr) {
        if (error) return cb(error);
        if (stderr) return cb(new Error(stderr));
        var out = parseFloat(stdout);
        if (!out && out !== NaN && out != 0) return cb(new Error('Invalid return value'));

        this.history.push({time: unixtime, value: out});
        cb(null);
    }.bind(this));
};

metric.prototype.report = function() {
    var v = _(this.history).last()
    console.log("%s :: %s :: %s", this.name, new Date(v.time * 1000), v.value);
};

metric.prototype.toJSON = function() {
    return { name: this.name, history: this.history };
}

var metrics = _(conf).map(function(v) { return new metric(v) })

var schedule = function(items, wait, samples, done) {
    var start = +(new Date);
    var q = queue();
    _(items).each(function(v) {
        q.defer(function(ts, cb) {
            v.run(ts, function(err) {
                if (err) return cb(err)
                v.report();
                cb();
            });
        }, (start / 1000 | 0));
    });
    q.await(function(err){
        if (err) return done(err);

        if (samples !== false) {
            samples--;
            if (samples <= 0) return done();
        }

        var delay = wait - (+(new Date) - start);
        if (delay < 0) {
            return done(new Error('command is too slow.'));
        }

        setTimeout(function() {
            schedule(items, wait, samples, done);
        }, delay);
    });
};

var samples = (argv.samples === false ? false : parseInt(argv.samples, 10));

console.log("Starting run...\n");

var jobs = queue();
_(metrics).chain()
    .groupBy(function(v) { return parseInt(argv.frequency, 10) * 1000 })
    .each(function(items, wait) { jobs.defer(schedule, items, wait, samples) });

jobs.await(function(err, results) {
    if (err) {
        console.warn(err.toString());
        process.exit(1);
    }

    if (results.length) {
        console.log("\nMeasured %s metrics %s times", metrics.length, samples);
    }


    if (argv.out) {
        var data = JSON.stringify(metrics, null, 4);

        fs.writeFile(argv.out, data, function(err) {
            if (err) {
                console.warn(err);
                process.exit(1);
            }
            console.log('Wrote results to ' + argv.out);
        });
    }
});
