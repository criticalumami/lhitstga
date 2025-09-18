const map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'parcel-basemap': {
                    type: 'geojson',
                    data: './lhi_tt_parcel_beirutmap.geojson'
                },
                'buildings': {
                    type: 'geojson',
                    data: './lhi_tt_buildings.geojson'
                },
                'shoreline': {
                    type: 'geojson',
                    data: './shore_wgs84.geojson'
                }
            },
            layers: [
                {
                    id: 'parcel-basemap-layer',
                    type: 'line',
                    source: 'parcel-basemap',
                    paint: {
                        'line-color': '#ccc',
                        'line-width': 1
                    }
                },
                {
                    id: 'buildings-layer',
                    type: 'fill',
                    source: 'buildings',
                    paint: {
                        'fill-color': '#e0e0e0',
                        'fill-outline-color': '#999'
                    }
                },
                {
                    id: 'shoreline-layer',
                    type: 'line',
                    source: 'shoreline',
                    paint: {
                        'line-color': '#f0f0f0',
                        'line-width': 2
                    }
                }
            ]
        },
        center: [35.50, 33.89], // Approximate center of Beirut
        zoom: 14
    });

    let allPointsData = null;
    let allBuildingsData = null;
    let allParcelsData = null;

    map.on('load', function () {
        // Load all GeoJSON data
        Promise.all([
            fetch('./lhi_tt_building_function.geojson').then(response => response.json()),
            fetch('./lhi_tt_buildings.geojson').then(response => response.json()),
            fetch('./lhi_tt_parcel_beirutmap.geojson').then(response => response.json())
        ]).then(([pointsGeoJSON, buildingsGeoJSON, parcelsGeoJSON]) => {
            allPointsData = pointsGeoJSON;
            allBuildingsData = buildingsGeoJSON;
            allParcelsData = parcelsGeoJSON;

            map.addSource('lhi-points', {
                type: 'geojson',
                data: allPointsData
            });

            map.addLayer({
                id: 'points',
                type: 'circle',
                source: 'lhi-points',
                paint: {
                    'circle-radius': 6,
                    'circle-color': [
                        'match',
                        ['get', 'data-A-Period'],
                        '1960-1970', '#08306b',
                        '1950-1959', '#08519c',
                        '1940-1949', '#2171b5',
                        '1930-1939', '#4292c6',
                        '1920-1929', '#6baed6',
                        '1870-1880', '#9ecae1',
                        /* other */ '#c6dbef'
                    ]
                }
            });

            map.addLayer({
                id: 'point-labels',
                type: 'symbol',
                source: 'lhi-points',
                layout: {
                    'text-field': ['get', 'data-A-BldgName'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'visibility': 'visible'
                },
                paint: {
                    'text-color': '#333',
                    'text-halo-color': '#fff',
                    'text-halo-width': 1
                }
            });

            // Highlight layers (initially empty)
            map.addSource('highlight-points', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            map.addLayer({
                id: 'highlight-points-layer',
                type: 'circle',
                source: 'highlight-points',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#ff0000',
                    'circle-stroke-color': '#fff',
                    'circle-stroke-width': 2
                }
            });

            map.addSource('highlight-geometries', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            map.addLayer({
                id: 'highlight-geometries-layer',
                type: 'fill',
                source: 'highlight-geometries',
                paint: {
                    'fill-color': '#00ffff',
                    'fill-opacity': 0.5,
                    'fill-outline-color': '#0000ff'
                }
            });

            const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false
            });

            map.on('mouseenter', 'points', function (e) {
                map.getCanvas().style.cursor = 'pointer';

                const coordinates = e.features[0].geometry.coordinates.slice();
                const period = e.features[0].properties['data-A-Period'];
                const buildingName = e.features[0].properties['data-A-BldgName'];

                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                popup.setLngLat(coordinates)
                    .setHTML('<b>' + buildingName + '</b><br>' + period)
                    .addTo(map);
            });

            map.on('mouseleave', 'points', function () {
                map.getCanvas().style.cursor = '';
                popup.remove();
            });

            // Search functionality
            const searchInput = document.getElementById('search-input');
            const searchResultsDiv = document.getElementById('search-results');

            searchInput.addEventListener('input', function (e) {
                const query = e.target.value.toLowerCase();
                searchResultsDiv.innerHTML = '';

                const highlightPoints = { type: 'FeatureCollection', features: [] };
                const highlightGeometries = { type: 'FeatureCollection', features: [] };
                const matchedFeatures = [];

                if (query.length > 2) { // Start searching after 2 characters
                    // Search in points layer
                    allPointsData.features.forEach(pointFeature => {
                        const properties = pointFeature.properties;
                        if ((properties['data-A-BldgName'] && properties['data-A-BldgName'].toLowerCase().includes(query)) ||
                            (properties['data-A-Street'] && properties['data-A-Street'].toLowerCase().includes(query)) ||
                            (properties['data-A-Period'] && properties['data-A-Period'].toLowerCase().includes(query))) {
                            matchedFeatures.push({ type: 'point', feature: pointFeature });
                            highlightPoints.features.push(pointFeature);

                            // Also highlight associated building/parcel if available
                            const buildingCode = properties['data-A-BldgCode'];
                            const plotNo = properties['data-A-PlotNo'];

                            if (buildingCode) {
                                const matchedBuilding = allBuildingsData.features.find(bldgFeature =>
                                    bldgFeature.properties['BldgCode'] === buildingCode
                                );
                                if (matchedBuilding) {
                                    highlightGeometries.features.push(matchedBuilding);
                                }
                            }
                            if (plotNo) {
                                const matchedParcel = allParcelsData.features.find(parcelFeature =>
                                    parcelFeature.properties['PlotNo'] === plotNo
                                );
                                if (matchedParcel) {
                                    highlightGeometries.features.push(matchedParcel);
                                }
                            }
                        }
                    });

                    // Search in buildings layer
                    allBuildingsData.features.forEach(bldgFeature => {
                        const properties = bldgFeature.properties;
                        if (properties['BldgCode'] && properties['BldgCode'].toLowerCase().includes(query)) {
                            matchedFeatures.push({ type: 'building', feature: bldgFeature });
                            highlightGeometries.features.push(bldgFeature);
                        }
                    });

                    // Search in parcels layer
                    allParcelsData.features.forEach(parcelFeature => {
                        const properties = parcelFeature.properties;
                        if ((properties['PlotNo'] && properties['PlotNo'].toLowerCase().includes(query)) ||
                            (properties['PID'] && properties['PID'].toLowerCase().includes(query))) {
                            matchedFeatures.push({ type: 'parcel', feature: parcelFeature });
                            highlightGeometries.features.push(parcelFeature);
                        }
                    });

                    // Display search results and update highlights
                    matchedFeatures.forEach(item => {
                        const feature = item.feature;
                        const resultItem = document.createElement('div');
                        resultItem.className = 'search-result-item';
                        let displayText = '';
                        let coordinatesToFlyTo = null;

                        if (item.type === 'point') {
                            displayText = feature.properties['data-A-BldgName'] || feature.properties['data-A-Street'] || 'Point';
                            coordinatesToFlyTo = feature.geometry.coordinates;
                        } else if (item.type === 'building') {
                            displayText = 'Building: ' + (feature.properties['BldgCode'] || 'Unknown');
                            coordinatesToFlyTo = feature.geometry.coordinates[0][0][0]; // Assuming MultiPolygon, take first coordinate
                        } else if (item.type === 'parcel') {
                            displayText = 'Parcel: ' + (feature.properties['PlotNo'] || 'Unknown');
                            coordinatesToFlyTo = feature.geometry.coordinates[0][0][0]; // Assuming MultiPolygon, take first coordinate
                        }

                        resultItem.textContent = displayText;
                        resultItem.addEventListener('click', () => {
                            if (coordinatesToFlyTo) {
                                map.flyTo({ center: coordinatesToFlyTo, zoom: 16 });
                            }
                        });
                        searchResultsDiv.appendChild(resultItem);
                    });

                    map.getSource('highlight-points').setData(highlightPoints);
                    map.getSource('highlight-geometries').setData(highlightGeometries);

                } else {
                    // Clear highlights if query is too short or empty
                    map.getSource('highlight-points').setData({ type: 'FeatureCollection', features: [] });
                    map.getSource('highlight-geometries').setData({ type: 'FeatureCollection', features: [] });
                }
            });

            // Locate Me functionality
            const locateMeButton = document.getElementById('locate-me-button');
            if (locateMeButton) {
                locateMeButton.addEventListener('click', function() {
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(function(position) {
                            const userLngLat = [position.coords.longitude, position.coords.latitude];
                            map.flyTo({ center: userLngLat, zoom: 14 });
                        }, function(error) {
                            alert('Error getting your location: ' + error.message);
                        });
                    } else {
                        alert('Geolocation is not supported by your browser.');
                    }
                });
            } else {
                console.warn('Locate Me button not found in the DOM.');
            }
        });
    });