package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
)

type Service struct {
	broker *Broker
}

var idGenerator = NewIdGenerator()

const clientIdCookieName = "clientId"

// ensureClientId retrieves the clientId associated with an incoming request
//
// If no clientId is set, a new ID will be generated and passed (via cookie)
// back to the client
func ensureClientId(w http.ResponseWriter, r *http.Request) ClientId {
	// Try to extract an existing clientId from the cookies sent with the
	// request
	cookie, err := r.Cookie(clientIdCookieName)
	if err == nil {
		return cookie.Value
	}

	// Since no clientId was found, we'll generate a new one...
	id := idGenerator.Id()

	// ...and pass it back to the client for inclusion in future requests
	http.SetCookie(w, &http.Cookie{
		Name:  clientIdCookieName,
		Value: id,
	})

	return id
}

func NewService(broker *Broker) *Service {
	return &Service{broker}
}

// Subscribe binds a client to the service's Broker using server-sent events
func (s *Service) Subscribe(w http.ResponseWriter, r *http.Request) {
	// Check that the request is an HTTP GET
	if r.Method != http.MethodGet {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	// Check that the connection supports server-sent events
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE unavailable", http.StatusBadRequest)
		return
	}

	// Signal the client to prepare for streaming data
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ctx := r.Context()

	// Retrieve (or generate) a unique ID representing this client
	clientId := ensureClientId(w, r)

	// Subscribe this client connection to the broker
	sub := make(chan []byte)
	s.broker.Subscribe(clientId, sub)
	defer s.broker.Unsubscribe(clientId)

	// Configure the client by preparing an "init" event with both the `clientId`
	// and a copy of the recent message history
	data, err := json.Marshal(struct {
		ClientId ClientId  `json:"clientId"`
		History  []Message `json:"history"`
	}{clientId, s.broker.Recent()})
	if err != nil {
		fmt.Println("Failed preparing 'init' message")
		return
	}

	// Flush the "init" event
	fmt.Fprintf(w, "event: init\ndata: %s\n\n", data)
	flusher.Flush()

	for {
		select {
		// Check for new messages from the broker. When a new message is received,
		// write it and flush the response.
		case data := <-sub:
			fmt.Fprintf(w, "event: published\ndata: %s\n\n", data)
			flusher.Flush()

		// Check for a closed connection.
		case <-ctx.Done():
			return
		}
	}
}

func (s *Service) hasValidClientId(r *http.Request) bool {
	cookie, err := r.Cookie(clientIdCookieName)
	return err == nil && s.broker.IsConnected(cookie.Value)
}

// Publish an incoming Message to the service's Broker
func (s *Service) Publish(w http.ResponseWriter, r *http.Request) {
	// Check that the request is an HTTP POST
	if r.Method != http.MethodPost {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	// Verify that the clientId is known to the broker
	if !s.hasValidClientId(r) {
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	}

	// Read the incoming request into memory
	buf, err := ioutil.ReadAll(r.Body)
	if err != nil {
		fmt.Printf("Body unparsing error: %v", err)
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	}

	// Unparse the incoming JSON request as a new Message
	// TODO(rjz) validate payload
	var msg Message
	if err := json.Unmarshal(buf, &msg); err != nil {
		fmt.Printf("JSON parsing error: %v", err)
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		return
	}

	s.broker.Publish(msg)
}
