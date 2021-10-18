function now(): number {
  return Math.floor(Date.now() / 1000);
}

const IdGenerator = {
  ALPHABET: 'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  id(n: number): string {
    let result = [];
    for (let i = 0; i < n; i++) {
      result.push(
        IdGenerator.ALPHABET[
          Math.floor(Math.random() * IdGenerator.ALPHABET.length)
        ],
      );
    }

    return result.join('');
  },
};

function prettyState(es: EventSource): string {
  switch (es.readyState) {
    case EventSource.OPEN:
      return 'OPEN';
    case EventSource.CLOSED:
      return 'CLOSED';
    case EventSource.CONNECTING:
      return 'CONNECTING';
    default:
      return 'UNKNOWN';
  }
}

type Message = {
  payload: string;
  ts: number;
  clientId: string;
  id: string;
};

function createMessage(clientId: string, message: string): Message {
  return {
    payload: message,
    ts: now(),
    clientId,
    id: IdGenerator.id(5),
  };
}

type LogEntry = {
  type: 'CLIENT' | 'SERVER';
  timestamp: number;
  message: string;
  clientId?: string;
  messageId?: string;
};

type Serializer = (val: any) => string;

class Log {
  private entries: [LogEntry, HTMLTableRowElement][] = [];

  static DateFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
  });

  static Serializers: { [k in keyof LogEntry]?: Serializer } = {
    type: (x: any) => x,
    clientId: (x: any) => String(x),
    messageId: (x: any) => String(x),
    timestamp(x: any) {
      const d = new Date(x);

      return Log.DateFormatter.format(d);
    },
    message: (x: any) => String(x),
  };

  constructor(private el: HTMLTableElement) {
    el.createTHead();
    el.createTBody();

    el.tHead!.innerHTML = `<tr>
      ${Object.keys(Log.Serializers)
        .map((k) => `<th>${k}</th>`)
        .join('\n')}
    </tr>`;
  }

  protected scrollToBottom() {
    const parentNode = this.el.parentNode as HTMLDivElement;
    parentNode.scrollTop = parentNode.scrollHeight;
  }

  protected addEntry(entry: LogEntry) {
    const tr = document.createElement('tr');
    Object.entries(Log.Serializers).forEach(function ([k, serialize]) {
      const field = entry[k as keyof LogEntry];
      const td = document.createElement('td');
      td.textContent = field ? serialize(field) : '???';
      tr.appendChild(td);
    });

    const tbody = this.el.tBodies[0]!;

    // Look up the appropriate insertion point in the list of entries
    const nextEntryIndex = this.entries.findIndex(([e]) => {
      return e.timestamp > entry.timestamp;
    });

    if (nextEntryIndex === -1) {
      this.entries.push([entry, tr]);
      tbody.appendChild(tr);
    } else {
      const [, nextNode] = this.entries[nextEntryIndex];
      this.entries.splice(nextEntryIndex, 0, [entry, tr]);
      tbody.insertBefore(tr, nextNode);
    }

    this.scrollToBottom();
  }

  public error(err: Error, message: string) {
    console.error('Error!', err);
    const timestamp = Math.floor(Date.now() / 1000);
    this.addEntry({ type: 'CLIENT', timestamp, message });
  }

  public info(message: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    this.addEntry({ type: 'CLIENT', timestamp, message });
  }

  public message(message: Message) {
    this.addEntry({
      type: 'SERVER',
      timestamp: message.ts * 1000,
      message: JSON.stringify(message.payload),
      clientId: message.clientId,
      messageId: message.id,
    });
  }

  public connectionStatus(es: EventSource) {
    this.addEntry({
      type: 'CLIENT',
      timestamp: now() * 1000,
      message: `Connection status: ${prettyState(es)}`,
    });
  }
}

function initDOM(): { tableEl: HTMLTableElement; formEl: HTMLFormElement } {
  const rootEl = document.getElementById('root') as HTMLDivElement;
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container';
  rootEl.appendChild(tableContainer);

  const tableEl = document.createElement('table');
  tableContainer.appendChild(tableEl);

  const formContainer = document.createElement('div');
  formContainer.className = 'form-container';
  rootEl.appendChild(formContainer);

  const formEl: HTMLFormElement = document.createElement('form');
  formEl.className = 'form--inline';
  formEl.innerHTML = `
    <input type="text" name="message" value="Helo, world!"/>
    <div class="form__actions">
      <button>send</button>
    </div>
  `;

  formContainer.appendChild(formEl);

  return { formEl, tableEl };
}

let clientId = '';
const url = 'http://localhost:5000/events';

function bindSubscription(log: Log) {
  // See: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
  const es = new EventSource(url + '/subscribe');

  es.addEventListener('open', function () {
    log.connectionStatus(es);
  });

  es.addEventListener('error', function () {
    clientId = '';
    log.connectionStatus(es);
  });

  es.addEventListener('published', function (e) {
    log.message(JSON.parse((e as MessageEvent).data));
  });

  es.addEventListener('init', function (e) {
    const { data } = e as MessageEvent;
    const initDetails = JSON.parse(data);
    clientId = initDetails.clientId;
    initDetails.history.forEach((l: Message) => log.message(l));
  });
}

function bindForm({ formEl, log }: { formEl: HTMLFormElement; log: Log }) {
  formEl.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!clientId) {
      alert('not connected!');
      return;
    }

    const message = formEl.message.value;
    formEl.reset();

    const body = JSON.stringify(createMessage(clientId, message));

    fetch(url + '/publish', {
      method: 'POST',
      headers: {
        'Content-type': 'application/json',
      },
      body,
    }).then((res) => {
      if (res.status > 399) {
        const errStr = `${res.status} ${res.statusText}`;
        log.error(new Error(errStr), `Event publishing failed (${errStr})`);
      }
    });
  });
}

window.addEventListener('DOMContentLoaded', function () {
  const { formEl, tableEl } = initDOM();
  const log = new Log(tableEl);

  bindSubscription(log);
  bindForm({ formEl, log });
});
