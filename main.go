package main

import (
	"fmt"
	"net/http"
)

func main() {
	port := ":5000"

	// Set up a pub/sub broker
	broker := NewBroker()

	// Set up an HTTP service bound to the broker
	service := NewService(broker)

	mux := http.NewServeMux()
	mux.HandleFunc("/events/subscribe", service.Subscribe)
	mux.HandleFunc("/events/publish", service.Publish)

	// Serve static assets for demo client
	mux.Handle("/", http.FileServer(http.Dir("./static")))

	fmt.Printf("Listening on %s\n", port)
	http.ListenAndServe(port, mux)
}
