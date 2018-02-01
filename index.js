import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isEqual } from 'lodash';

class ApiCache {
	constructor( fetch ) {
		this.fetch = fetch;
		this.cache = {};
		this.eventSubscribers = {};
	}
	get( url, params ) {
		if ( this.getCache( url ) === 'pending' ) {
			return;
		}
		if ( this.getCache( url ) ) {
			return this.trigger( url, this.getCache( url ) )
		}
		const promise = this.fetch( url, params )
			.then( r => this.handleResponse( r ) )
			.then( response => {
				this.setCache( url, response )
				this.trigger( url, response )
			} )
			.catch( error => {
				this.setCache( url, error )
				this.trigger( url, error )
			} )

		this.setCache( url, 'pending' )

		return promise;
	}
	getCache( url ) {
		return this.cache[ url ];
	}
	setCache( url, response ) {
		this.cache[ url ] = response;
	}
	handleResponse( response ) {
		return response.text().then( responseText => {
			try {
				var json = JSON.parse( responseText )
			} catch ( e ) {
				throw new Error( responseText );
			}

			if ( response.status > 299 ) {
				throw new Error( json.message );
			}
			return json;
		} )
	}
	on( url, callback ) {
		this.eventSubscribers[ url ] = this.eventSubscribers[ url ] || [];
		this.eventSubscribers[ url ].push( callback );
		this.get( url )
	}
	trigger( url, response ) {
		this.eventSubscribers[url].map( f => f( response ) )
	}
	removeCache( url ) {
		delete this.cache[ url ];
	}
}

export class Provider extends Component {
	static childContextTypes = {
		api:      PropTypes.func.isRequired,
		apiCache: PropTypes.object.isRequired,
	};
	constructor( props ) {
		super( props )
		this.apiCache = new ApiCache( props.fetch );
	}
	getChildContext() {
		return { api: this.props.fetch, apiCache: this.apiCache };
	}
	render() {
		return this.props.children;
	}
}

export class WithApiData extends Component {
	render( props ) {
		const ChildComponent = withApiData( this.props.mapPropsToData )( this.props.render || this.props.component );
		return <ChildComponent ref={ apiData => this.apiData = apiData } {...this.props} />
	}
	refreshData() {
		if ( this.apiData ) {
			this.apiData.onRefreshData();
		}
	}
	invalidateData() {
		if ( this.apiData ) {
			this.apiData.onInvalidateData();
		}
	}
}

export const withApiData = mapPropsToData => WrappedComponent => {
	class APIDataComponent extends Component {
		static contextTypes = {
			api:      PropTypes.func.isRequired,
			apiCache: PropTypes.object.isRequired,
		};
		constructor( props ) {
			super( props );
			this.state = { dataProps: this.getPropsMapping() };
		}

		componentDidMount() {
			this.unmounted = false;
			this.updateProps( this.props );
		}

		componentWillUnmount() {
			this.unmounted = true;
		}

		componentWillReceiveProps( nextProps ) {
			const oldDataMap = mapPropsToData( this.props );
			const newDataMap = mapPropsToData( nextProps );
			if ( isEqual( oldDataMap, newDataMap ) ) {
				return;
			}
			this.updateProps( nextProps );
		}

		getPropsMapping() {
			const dataMap = mapPropsToData( this.props );
			const keys = Object.keys( dataMap );
			const dataProps = {};
			keys.forEach( key => {
				dataProps[ key ] = {
					isLoading: true,
					error:     null,
					data:      null,
				}
			} );
			return dataProps;
		}

		updateProps( props, skipCache = false ) {
			const dataMap = mapPropsToData( props );
			const dataProps = { ...this.state.dataProps };

			Object.entries( dataMap ).forEach( ( [ key, endpoint ] ) => {
				if ( ! endpoint ) {
					return;
				}
				this.context.apiCache.on( endpoint, ( data ) => {
					let error = null;
					if ( this.unmounted ) {
						return data;
					}

					if ( data instanceof Error ) {
						error = data;
						data = null;
					}
					const prop = {
						error:     error,
						isLoading: false,
						data,
					};
					this.setState( {
						dataProps: {
							...this.state.dataProps,
							[ key ]: prop,
						},
					} );
				} )

				dataProps[ key ] = {
					isLoading: true,
					error:     null,
					...this.state.dataProps[ key ],
				};

			} );
			this.setState( { dataProps } );
		}

		onFetch( ...args ) {
			return this.context.api( ...args );
		}
		onRefreshData() {
			this.onInvalidateData();
		}
		onInvalidateData() {
			const dataMap = mapPropsToData( this.props );
			Object.entries( dataMap ).forEach( ( [ key, endpoint ] ) => {
				this.context.apiCache.removeCache( endpoint )
			} );
			this.updateProps( this.props );
		}

		onInvalidateDataForUrl( url ) {
			this.context.apiCache.removeCache( url )
			this.updateProps( this.props );
			this.context.apiCache.get( url );
		}

		getWrappedInstance() {
			return this.wrapperRef;
		}

		render() {
			return (
				<WrappedComponent
					{ ...this.props }
					{ ...this.state.dataProps }
					fetch={( ...args ) => this.onFetch( ...args )}
					ref={ref => this.wrapperRef = ref}
					refreshData={ ( ...args ) => this.onRefreshData( ...args ) }
					invalidateData={ () => this.onInvalidateData() }
					invalidateDataForUrl={ ( ...args ) => this.onInvalidateDataForUrl( ...args ) }
				/>
			);
		}
	}

	// Derive display name from original component
	const { displayName = WrappedComponent.name || 'Component' } = WrappedComponent;
	APIDataComponent.displayName = `apiData(${ displayName })`;

	return APIDataComponent;
};
