class Simulation {
    constructor() {
        this.name = undefined;
        this.outputName = undefined;

        this.collection = {
            postman: undefined,
            requests: [],
            reqStr: ''
        };
        this.environment = {
            postman: {
                values: []
            },
            feeder: {}
        };
    }
}

Simulation.prototype.loadEnvironnement = function (environmentFile) {
    var self = this;

    if (environmentFile !== undefined) {
        self.environment.postman = JSON.parse(fs.readFileSync(environmentFile, 'utf8'));
    }
};

Simulation.prototype.loadCollection = function (collectionFile, args) {
    var self = this;

    self.collection.postman = JSON.parse(fs.readFileSync(collectionFile, 'utf8'));
    self.name = self.collection.postman.name;
    self.outputName = args.output ? args.output : self.name;
};

Simulation.prototype.buildFeeder = function () {
    var self = this;

    for (var i = 0, size = self.environment.postman.values.length; i < size; i += 1) {
        if (self.environment.postman.values[i].enabled) {
            self.environment.feeder[self.environment.postman.values[i].key] = varString(self.environment.postman.values[i].value);
        }
    }

    var updated = true;

    function varReplace(matchAll, varKey) {
        updated = true;
        return self.environment.feeder[varKey];
    }

    while (updated) {
        updated = false;

        for (var key in self.environment.feeder) {
            if ({}.hasOwnProperty.call(self.environment.feeder, key)) {
                self.environment.feeder[key] = self.environment.feeder[key].replace(/\$\{(.*?)\}/gmi, varReplace);
            }
        }
    }
};

Simulation.prototype.buildRequests = function () {
    var self = this;

    var folders = self.collection.postman.folders.sort(function (a, b) {
        if (a.name < b.name) {
            return -1;
        } else if (a.name === b.name) {
            return 0;
        }
        return 1;
    });

    for (var i = 0, size = folders.length; i < size; i += 1) {
        self.buildCollection(folders[i]);
    }

    self.buildCollection(self.collection.postman);
};

Simulation.prototype.buildCollection = function (collection) {
    var self = this;

    for (var i = 0, size = collection.order.length; i < size; i += 1) {
        var request = new Request(self.getRawRequest(collection.order[i])).build();
        self.collection.requests.push(request);
    }
};

Simulation.prototype.getRawRequest = function (id) {
    var self = this;

    for (var i = 0, size = self.collection.postman.requests.length; i < size; i += 1) {
        if (self.collection.postman.requests[i].id === id) {
            return self.collection.postman.requests[i];
        }
    }
};

Simulation.prototype.toScala = function () {
    var self = this;

    if (!fs.existsSync(GATLING_BODIES + self.outputName)) {
        fs.mkdirSync(GATLING_BODIES + self.outputName);
    }

    var str = '';

    for (var i = 0, size = self.collection.requests.length; i < size; i += 1) {
        str += self.collection.requests[i].toScala(self.outputName, 2);
    }

    return str;
};

module.exports = Simulation;
