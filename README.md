# Reach HOC for WP REST API data loading

`withApiData` is based on WordPress Gutenberg's legacy data loading higher order component. It's a minimal data loading library to pull REST API responses into component props. This should only be used for simple data loading / displaying. Use React-redux or similar if you need two way data manipulation etc.

You can use both the `withApiData` higher order component, or the `WithApiData` React component to load data. When using either, you need a `<Provider>` component wrapping your application. This library can be used in conjunction with https://www.npmjs.com/package/wordpress-rest-api-oauth-2 to provide authentication.

## Setup

Wrap your component tree in the `Provider` component to establish an API context for all embedded data calls:

```js
import { Provider } from 'with-api-data';
import 'api' from './api' //  assumes an instance of the wordpress-rest-api-oauth-2

export defualt function App() {
    return <Provider fetch={ api.fetch }><MyApp /></Provider>
}
```

Each instance of the Provider has an API cache which is used across all components in the tree, so multiple components loading data for the same REST url will share requests and caches.

## Use `withApiData`

```js
import { withApiData } from 'with-api-data';

function Post( props ) {
    <div>
        { props.post.data && props.post.data.title.rendered }
    </div>
}

export default withApiData( props => {
    post: `/wp/v2/posts/${ props.id }`,
} )( Post );
```

`withApiData` takes a function that will return a map of props to pass to the component. Each prop will be in the shape:

```js
{
    isLoading: boolean,
    error: null | Error,
    data: null | [rest api data],
    responce: Response // from fetch()
}
```

`withApiData` is also inject some additional props into your component:

```js
{
    fetch: ( url, options ) => Response, // A binding to the fetch handler passed in the Provider.
    post: ( url, data ) => [rest api response data], // A convenience function for sending POST requests.
    refreshData: () => null, // A function to reload the data from the REST API for the component.
    invalidateDataForUrl: ( url ) => null, // A function to reload data for a specific URL that is used in this component.
}
```


