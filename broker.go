package main

import (
	"encoding/json"
	"fmt"
	"sync"
)

type ClientId = string

// Message from a connected client
type Message struct {
	// ClientId should uniquely identify a client
	ClientId string `json:"clientId"`

	// Id should be unique across all messages sent by the client
	Id string `json:"id"`

	// Timestamp is a UNIX timestamp representing the system time when the client
	// sent the message
	//
	// TODO(rjz): reconcile with server time
	Timestamp uint64 `json:"ts"`

	// Payload is a (typically JSON) bit-bucket containing the body of the message
	// TODO(rjz): provide facilities for validating this
	Payload string `json:"payload"`
}

// Broker demonstrates server-sent events (SSE)
//
// Useful for illustration, utterly inadequate for production cases. Details at
// https://html.spec.whatwg.org/multipage/server-sent-events.html
type Broker struct {
	mtx         *sync.Mutex
	subscribers map[ClientId]chan []byte

	// history preserves recent messages for newly-connected clients' benefit
	history []Message
	log     chan Message
}

// NewBroker creates a new Broker
func NewBroker() *Broker {
	log := make(chan Message)

	broker := Broker{
		mtx:         new(sync.Mutex),
		subscribers: make(map[ClientId]chan []byte),
		history:     []Message{},
		log:         log,
	}

	go func() {
		for {
			select {
			// Wait for new messages to add to the broker's history.
			case str := <-log:
				var h []Message = broker.history

				// Ring buffer on a budget: we'll discard history beyond a
				// predetermined limit
				offset := len(h) - 10
				if offset > 0 {
					h = h[offset:]
				}

				broker.history = append(h, str)
			}
		}
	}()

	return &broker
}

// IsConnected determines whether the clientId is recognized/connected
func (broker *Broker) IsConnected(clientId ClientId) bool {
	broker.mtx.Lock()
	defer broker.mtx.Unlock()

	_, ok := broker.subscribers[clientId]
	return ok
}

// Subscribe a new client to the broker
func (broker *Broker) Subscribe(clientId ClientId, s chan []byte) {
	broker.mtx.Lock()
	defer broker.mtx.Unlock()

	if _, ok := broker.subscribers[clientId]; ok {
		panic("client already subscribed!")
	}

	broker.subscribers[clientId] = s

	fmt.Printf("client[%s] connected -- welcome!\n", clientId)
}

// Unsubscribe a client
func (broker *Broker) Unsubscribe(clientId ClientId) {
	broker.mtx.Lock()
	defer broker.mtx.Unlock()

	s, ok := broker.subscribers[clientId]
	if !ok {
		panic("client not subscribed")
	}

	close(s)
	delete(broker.subscribers, clientId)

	fmt.Printf("client[%s] disconnected -- goodbye!\n", clientId)
}

// Publish a new message to the broker
func (broker *Broker) Publish(msg Message) {
	// Push the message to the broker's local history...
	broker.log <- msg

	// ...and (after serialization) to all of the connected subscribers.
	data, err := json.Marshal(msg)
	if err != nil {
		fmt.Println("Failed serializing message", err)
		return
	}

	for _, channel := range broker.subscribers {
		channel <- data
	}
}

// Recent returns recent messages published through the broker
//
// Useful for providing context to newly-connected clients
func (broker *Broker) Recent() []Message {
	return broker.history
}
