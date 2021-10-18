"use strict";
function now() {
    return Math.floor(Date.now() / 1000);
}
var IdGenerator = {
    ALPHABET: "abcdefghijklmnopqrstuvwxyz0123456789".split(""),
    id: function (n) {
        var result = [];
        for (var i = 0; i < n; i++) {
            result.push(IdGenerator.ALPHABET[Math.floor(Math.random() * IdGenerator.ALPHABET.length)]);
        }
        return result.join("");
    },
};
function prettyState(es) {
    switch (es.readyState) {
        case EventSource.OPEN:
            return "OPEN";
        case EventSource.CLOSED:
            return "CLOSED";
        case EventSource.CONNECTING:
            return "CONNECTING";
        default:
            return "UNKNOWN";
    }
}
function createMessage(clientId, message) {
    return {
        payload: message,
        ts: now(),
        clientId: clientId,
        id: IdGenerator.id(5),
    };
}
var Log = /** @class */ (function () {
    function Log(el) {
        this.el = el;
        this.entries = [];
        el.createTHead();
        el.createTBody();
        el.tHead.innerHTML = "<tr>\n      " + Object.keys(Log.Serializers)
            .map(function (k) { return "<th>" + k + "</th>"; })
            .join("\n") + "\n    </tr>";
    }
    Log.prototype.scrollToBottom = function () {
        var parentNode = this.el.parentNode;
        parentNode.scrollTop = parentNode.scrollHeight;
    };
    Log.prototype.addEntry = function (entry) {
        var tr = document.createElement("tr");
        Object.entries(Log.Serializers).forEach(function (_a) {
            var k = _a[0], serialize = _a[1];
            var field = entry[k];
            var td = document.createElement("td");
            td.textContent = field ? serialize(field) : "???";
            tr.appendChild(td);
        });
        var tbody = this.el.tBodies[0];
        // Look up the appropriate insertion point in the list of entries
        var nextEntryIndex = this.entries.findIndex(function (_a) {
            var e = _a[0];
            return e.timestamp > entry.timestamp;
        });
        if (nextEntryIndex === -1) {
            this.entries.push([entry, tr]);
            tbody.appendChild(tr);
        }
        else {
            var _a = this.entries[nextEntryIndex], nextNode = _a[1];
            this.entries.splice(nextEntryIndex, 0, [entry, tr]);
            tbody.insertBefore(tr, nextNode);
        }
        this.scrollToBottom();
    };
    Log.prototype.error = function (err, message) {
        console.error("Error!", err);
        var timestamp = Math.floor(Date.now() / 1000);
        this.addEntry({ type: "CLIENT", timestamp: timestamp, message: message });
    };
    Log.prototype.info = function (message) {
        var timestamp = Math.floor(Date.now() / 1000);
        this.addEntry({ type: "CLIENT", timestamp: timestamp, message: message });
    };
    Log.prototype.message = function (message) {
        this.addEntry({
            type: "SERVER",
            timestamp: message.ts * 1000,
            message: JSON.stringify(message.payload),
            clientId: message.clientId,
            messageId: message.id,
        });
    };
    Log.prototype.connectionStatus = function (es) {
        this.addEntry({
            type: "CLIENT",
            timestamp: now() * 1000,
            message: "Connection status: " + prettyState(es),
        });
    };
    Log.DateFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZoneName: "short",
    });
    Log.Serializers = {
        type: function (x) { return x; },
        clientId: function (x) { return String(x); },
        messageId: function (x) { return String(x); },
        timestamp: function (x) {
            var d = new Date(x);
            return Log.DateFormatter.format(d);
        },
        message: function (x) { return String(x); },
    };
    return Log;
}());
function initDOM() {
    var rootEl = document.getElementById("root");
    var tableContainer = document.createElement("div");
    tableContainer.className = "table-container";
    rootEl.appendChild(tableContainer);
    var tableEl = document.createElement("table");
    tableContainer.appendChild(tableEl);
    var formContainer = document.createElement("div");
    formContainer.className = "form-container";
    rootEl.appendChild(formContainer);
    var formEl = document.createElement("form");
    formEl.className = "form--inline";
    formEl.innerHTML = "\n    <input type=\"text\" name=\"message\" value=\"Helo, world!\"/>\n    <div class=\"form__actions\">\n      <button>send</button>\n    </div>\n  ";
    formContainer.appendChild(formEl);
    return { formEl: formEl, tableEl: tableEl };
}
var clientId = "";
var url = "http://localhost:5000/events";
function bindSubscription(log) {
    // See: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
    var es = new EventSource(url + "/subscribe");
    es.addEventListener("open", function () {
        log.connectionStatus(es);
    });
    es.addEventListener("error", function () {
        clientId = '';
        log.connectionStatus(es);
    });
    es.addEventListener("published", function (e) {
        log.message(JSON.parse(e.data));
    });
    es.addEventListener("init", function (e) {
        var data = e.data;
        var initDetails = JSON.parse(data);
        clientId = initDetails.clientId;
        initDetails.history.forEach(function (l) { return log.message(l); });
    });
}
function bindForm(_a) {
    var formEl = _a.formEl, log = _a.log;
    formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!clientId) {
            alert('not connected!');
            return;
        }
        var message = formEl.message.value;
        formEl.reset();
        var body = JSON.stringify(createMessage(clientId, message));
        fetch(url + "/publish", {
            method: "POST",
            headers: {
                "Content-type": "application/json",
            },
            body: body,
        }).then(function (res) {
            if (res.status > 399) {
                var errStr = res.status + " " + res.statusText;
                log.error(new Error(errStr), "Event publishing failed (" + errStr + ")");
            }
        });
    });
}
window.addEventListener("DOMContentLoaded", function () {
    var _a = initDOM(), formEl = _a.formEl, tableEl = _a.tableEl;
    var log = new Log(tableEl);
    bindSubscription(log);
    bindForm({ formEl: formEl, log: log });
});
