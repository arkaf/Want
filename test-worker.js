// Test script for Cloudflare Worker API
const API = "https://want.fiorearcangelodesign.workers.dev";

async function testWorker() {
    console.log('Testing Cloudflare Worker API...');
    
    try {
        // Test GET /items
        console.log('\n1. Testing GET /items...');
        const getResponse = await fetch(`${API}/items?listId=test-list`);
        console.log('Status:', getResponse.status, getResponse.statusText);
        
        if (getResponse.ok) {
            const getData = await getResponse.json();
            console.log('Response:', getData);
        } else {
            const errorText = await getResponse.text();
            console.log('Error response:', errorText);
        }
        
        // Test POST /items
        console.log('\n2. Testing POST /items...');
        const testItem = {
            url: 'https://example.com',
            title: 'Test Item',
            price: '$99.99',
            image: 'https://example.com/image.jpg'
        };
        
        const postResponse = await fetch(`${API}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listId: 'test-list', item: testItem })
        });
        
        console.log('Status:', postResponse.status, postResponse.statusText);
        
        if (postResponse.ok) {
            const postData = await postResponse.json();
            console.log('Response:', postData);
            
            // Test DELETE if POST was successful
            if (postData.id) {
                console.log('\n3. Testing DELETE /items...');
                const deleteResponse = await fetch(`${API}/items?id=${postData.id}&listId=test-list`, {
                    method: 'DELETE'
                });
                
                console.log('Status:', deleteResponse.status, deleteResponse.statusText);
                
                if (deleteResponse.ok) {
                    const deleteData = await deleteResponse.json();
                    console.log('Response:', deleteData);
                } else {
                    const errorText = await deleteResponse.text();
                    console.log('Error response:', errorText);
                }
            }
        } else {
            const errorText = await postResponse.text();
            console.log('Error response:', errorText);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testWorker();
