async function trackAnalyticsEvent(eventName, data) {
    // console.log('tracking analytics event: ', eventName, data);

    const response = await fetch(
        `${FIREBASE_FUNCTIONS_URL}analyticsIngest`,
        {
            method: 'POST',
            body: JSON.stringify({ eventName, data }),
            headers: {
                'Content-Type': 'application/json'
            },
        },
    );
    const jsonResponse = await response.json();
    if (response.status !== 200) {
        console.error(jsonResponse);
    } else {
        // log response was successful
        // console.log('tracking analytics event successful: ', jsonResponse);
    }
}