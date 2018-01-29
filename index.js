import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isEqual } from 'lodash';

export class Provider extends Component {
	static childContextTypes = {
		api: PropTypes.func.isRequired,
		apiCache: PropTypes.object.isRequired,
	};
	constructor(props) {
		super(props)
		this.apiCache = {}
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
			api: PropTypes.func.isRequired,
			apiCache: PropTypes.object.isRequired,
		};
		constructor( props ) {
			super( props );
			this.state = { dataProps: this.getPropsMapping() };
		}

		componentDidMount() {
			this.unmounted = false;
			this.fetchData( this.props );
		}

		componentWillUnmount() {
			this.unmounted = true;
		}

		componentWillReceiveProps( nextProps ) {
			const oldDataMap = mapPropsToData(this.props);
			const newDataMap = mapPropsToData(nextProps);
			if ( isEqual( oldDataMap, newDataMap ) ) {
				return;
			}
			this.fetchData( nextProps );
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

		fetchData( props, skipCache = false ) {
			const dataMap = mapPropsToData( props );
			const dataProps = { ...this.state.dataProps };

			Object.entries( dataMap ).forEach( ( [ key, endpoint ] ) => {
				if ( ! endpoint ) {
					return;
				}
				const handleResponse = response => {
					return response.text().then( responseText => {
						try {
							var json = JSON.parse( responseText )
						} catch( e ) {
							throw { message: responseText, code: response.status }
						}

						if ( response.status > 299 ) {
							throw json;
						}

						return json;
					} )
				}
				const handleData = data => {
					if ( this.unmounted ) {
						return data;
					}
					const prop = {
						error:     null,
						isLoading: false,
						data,
					};
					this.setState( {
						dataProps: {
							...this.state.dataProps,
							[ key ]: prop,
						},
					} );
					return data;
				};
				const handleError = error => {
					if ( this.unmounted ) {
						return error;
					}
					const data = {
						error,
						isLoading: false,
						data:      null,
					};
					this.setState( {
						dataProps: {
							...this.state.dataProps,
							[ key ]: data,
						},
					} )
				};

				const cacheKey = `GET::${endpoint}`;
				dataProps[ key ] = {
					isLoading: true,
					error:     null,
					...this.state.dataProps[ key ],
				};
				if ( skipCache === false && this.context.apiCache[ cacheKey ] ) {
					return this.context.apiCache[ cacheKey ].then( handleData ).catch( handleError )
				} else if ( window.wpRestApiData && window.wpRestApiData[ cacheKey ] ) {
					dataProps[ key ] = {
						isLoading: false,
						error:     null,
						data:      window.wpRestApiData[ cacheKey ],
					};
				} else {
					this.context.apiCache[ cacheKey ] = this.context.api( endpoint ).then( handleResponse );
					return this.context.apiCache[ cacheKey ].then( handleData ).catch( handleError )
				}

			} );
			this.setState( { dataProps } );
		}

		onFetch(...args) {
			return this.context.api( ...args );
		}
		onRefreshData() {
			this.fetchData( this.props, true );
		}
		onInvalidateData() {
			const dataMap = mapPropsToData( this.props );
			Object.entries( dataMap ).forEach( ( [ key, endpoint ] ) => {
				const cacheKey = `GET::${endpoint}`;
				if ( this.context.apiCache[ cacheKey ] ) {
					delete this.context.apiCache[ cacheKey ];
				}
			} );
		}

		onInvalidateDataForUrl( url ) {
			const cacheKey = `GET::${url}`;
			if ( this.context.apiCache[ cacheKey ] ) {
				delete this.context.apiCache[ cacheKey ];
				return true;
			}
			return false;
		}

		getWrappedInstance() {
			return this.wrapperRef;
		}

		render() {
			return (
				<WrappedComponent
					{ ...this.props }
					{ ...this.state.dataProps }
					fetch={(...args) => this.onFetch(...args)}
					ref={ref => this.wrapperRef = ref}
					refreshData={ (...args) => this.onRefreshData(...args) }
					invalidateData={ () => this.onInvalidateData() }
					invalidateDataForUrl={ (...args) => this.onInvalidateDataForUrl( ...args ) }
				/>
			);
		}
	}

	// Derive display name from original component
	const { displayName = WrappedComponent.name || 'Component' } = WrappedComponent;
	APIDataComponent.displayName = `apiData(${ displayName })`;

	return APIDataComponent;
};
