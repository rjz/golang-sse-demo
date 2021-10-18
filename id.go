package main

import (
	"math/rand"
	"time"
)

var letters = []rune("abcdefghijklmnopqrstuvwxyz0123456789")

// From https://stackoverflow.com/a/22892986
func randSeq(n int) string {
	b := make([]rune, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

// TODO(rjz): maintain/check set of previously-used IDs
type IdGenerator struct{}

func NewIdGenerator() *IdGenerator {
	g := new(IdGenerator)
	rand.Seed(time.Now().UnixNano())

	return g
}

func (g *IdGenerator) Id() string {
	id := randSeq(7)
	return id
}
