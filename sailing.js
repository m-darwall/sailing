// boat visuals
boat_colour = "#ffffff"
gunwale_colour  = "#000000"
tiller_colour = "#000000"
sail_colour = "#0000ff"

// physical constants
air_density = 1;
water_density = 1000;

// display variable
ppm = 18; // pixels per meter


// wind indicator
arrow_width = 30; // in pixels
arrow_length = 60; // in pixels
arrow_points = {
    "tip": [0, 0.6*arrow_length],
    "tail": [0, 0],
    "left": [-arrow_width*0.5, -0.4*arrow_length],
    "right": [arrow_width*0.5, -0.4*arrow_length]
}


class Boat{
    /**
     * Boat
     * @param {Number}x x position of boat in pixels
     * @param {Number}y y position of boat in pixels
     * @param {Number}beam beam(width) of boat in meters
     * @param {Number}loa length overall of boat
     * @param {Number}bearing bearing from North in degrees
     * @param {Number}rudder_area area in meters squared of the side of the boat's rudder
     * @param {Number}keel_area area in meters squared of the side of the boat's keel
     * @param {Number}sail_area sail area in meters of the mainsail
     * @param {Number}mass mass of the boat in kg
     */
    constructor(x, y, beam, loa, bearing, rudder_area, keel_area, sail_area, mass) {
        // motion
        this.x = x/ppm; // meters
        this.y = y/ppm; // meters
        this.mass = mass; // kilograms
        this.dx = 0; // meters per second
        this.dy = 0; // meters per second
        this.dx2 = 0; // ms^-2
        this.d2y = 0; // ms^-2
        // rotation
        this.bearing = (bearing % 360 + 360)%360; // 0 to 360 degrees
        this.v_rot = 0; // rotational velocity in rad s^-1
        this.dv_rot = 0; // rotational acceleration in rad s^-2
        this.moment_of_inertia = 80; // moment of inertia in kg m^2
        // sensors
        this.wind_getter = null;
        // sail
        this.sail_angle = 0; // -90 to 90 degrees
        this.main_sheet = 0; // quantity of main sheet let out. Measured as current max degrees from center line for the boom
        this.sail_area = sail_area; // meters squared
        this.sail_step = 5; // degrees
        this.sail_drag_coefficient = 0.004;
        this.sail_edge_area = 0.7;
        // rudder
        this.rudder_angle = 0; // -90 to 90
        this.rudder_area = rudder_area; // meters squared
        this.rudder_step = 3; // degrees
        // keel
        this.keel_area = keel_area; // meters squared
        this.keel_drag_coefficient = 0.004;
        this.keel_edge_area = 0.01;
        // boat dimensions
        this.beam = beam; // (boat width) in meters
        this.loa = loa; // length overall
        // points for drawing the boat
        this.boat_points = {
            "bow": [0, 0.5*this.loa],
            "port_stern": [-this.beam * 0.5, 0.5*-this.loa],
            "starboard_stern": [this.beam * 0.5, -this.loa*0.5],
            "mast": [0, 0.6],
            "keel": [0, -0],
            "clew": [0, -2.1],
            "stern": [0, -this.loa*0.5],
            "tiller_tip": [0, -0.25 * this.loa],
            "rudder_tip": [0, -0.55 * this.loa]
        };
        // user control listener
        self.addEventListener('keydown', (event) => {
            const key = event.code; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"
            const callback = {
                "KeyA"  : this.leftHandler.bind(this),
                "KeyD" : this.rightHandler.bind(this),
                "KeyI"    : this.inHandler.bind(this),
                "KeyO"  : this.outHandler.bind(this),
            }[key];
            callback?.()
        });
        // debugging
        this.debug_text = ""; // for logging values and printing them to screen
    }

    leftHandler(){
        // rotates rudder clockwise
        if(this.rudder_angle < 50 - this.rudder_step){
            this.rudder_angle += this.rudder_step;
        }
    }

    rightHandler(){
        // rotates rudder anti-clockwise
        if(this.rudder_angle > -50 + this.rudder_step){
            this.rudder_angle -= this.rudder_step;
        }
    }

    inHandler(){
        // pulls in main sheet if possible
        this.main_sheet -= this.sail_step;
        if(this.main_sheet < 0){
            this.main_sheet = 0;
        }
        this.update_sail();
    }

    outHandler(){
        // lets out mainsheet if possible
        this.main_sheet += this.sail_step;
        if(this.main_sheet > 90){
            this.main_sheet = 90;
        }
        this.update_sail();
        if(this.main_sheet > Math.abs(this.sail_angle)){
            this.main_sheet = Math.abs(this.sail_angle);
        }
    }

    update_sail(){
        // updates sail to correct position according to wind and main sheet (soon to have updated realism)
        let wind = this.wind_getter();
        let distance_from_center = this.boat_points.mast[1] + (this.boat_points.mast[1] - this.boat_points.clew[1])*0.7 *Math.cos(toRadians(this.sail_angle + this.bearing));
        let apparent_wind = this.calculate_apparent_wind(wind[0], wind[1], distance_from_center);
        let apparent_wind_bearing = toDegrees(Math.atan2(apparent_wind[0], apparent_wind[1]));

        let max_sail_angle = Math.sign(this.bearing - apparent_wind_bearing)*180 - (this.bearing - apparent_wind_bearing);
        if(apparent_wind_bearing === this.bearing){
            max_sail_angle = 90;
        }
        if (Math.abs(max_sail_angle) > 90){
            max_sail_angle = Math.sign(max_sail_angle)*90;
        }
        if(Math.abs(max_sail_angle) > this.main_sheet){
            max_sail_angle = Math.sign(max_sail_angle)*this.main_sheet;
        }
        this.sail_angle = max_sail_angle;
    }

    // updates boat state
    update(delta_time){
        /** updates boat position, rotation and acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        this.update_position_and_velocity(delta_time);
        this.update_rotation(delta_time);
        this.update_sail();
        this.update_acceleration();
    }


    update_acceleration(){
        // updates boat translational and rotational acceleration due to environmental factors
        let wind_force = this.calculate_wind_force();
        let water_resistance = this.calculate_water_resistance();

        let resultant_x = wind_force[0] + water_resistance[0];
        let resultant_y = wind_force[1] + water_resistance[1];
        let resultant_moment = wind_force[2] + water_resistance[2];
        // F = ma -> a = F/m
        this.dx2 = resultant_x / this.mass;
        this.d2y = resultant_y / this.mass;
        this.dv_rot = resultant_moment / this.moment_of_inertia;
    }


    update_position_and_velocity(delta_time){
        /** updates boat position and velocity based on current velocity and acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        // use v = u + at to update velocity
        this.dx = this.dx + this.dx2*delta_time/1000;
        this.dy = this.dy + this.d2y*delta_time/1000;
        // use x = ut + 0.5at^2 to find new position
        this.x = this.x + this.dx*delta_time/1000 + 0.5*this.dx2*Math.pow(delta_time/1000, 2);
        this.y = this.y + this.dy*delta_time/1000 + 0.5*this.d2y*Math.pow(delta_time/1000, 2);
    }

    update_rotation(delta_time){
        /** updates boat bearing and rotational velocity based on rotational velocity and rotational acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        // use v = u + at to update rotational velocity
        this.v_rot = this.v_rot + this.dv_rot*delta_time/1000;
        // use x = ut + 0.5at^2 to find new rotation
        this.bearing = ((this.bearing + toDegrees(this.v_rot*delta_time/1000 + 0.5*this.dv_rot*Math.pow(delta_time/1000, 2))) % 360 +360)%360;
    }

    calculate_apparent_wind(point){
        /** calculates apparent wind for a point on the boat
         * @param {Number[2]} point the point relative to the center of rotation when bearing is 0
         * @returns {Number[2]} the x and y components of the apparent wind at the given point
         */
        let radius = Math.sqrt(Math.pow(x, 2) + Math.pow(y ,2));
        point = rotate(point, this.bearing);
        // velocity from boat rotation
        let v_from_rotation = this.v_rot * radius;
        let v_from_rotation_x = v_from_rotation*Math.cos(Math.atan2(point[0], point[1]));
        let v_from_rotation_y = v_from_rotation*-Math.sin(Math.atan2(point[0], point[1]));

        let wind = this.wind_getter();

        // apparent velocity of medium in x direction
        let apparent_x = -this.dx + wind[0] + -v_from_rotation_x;
        // apparent velocity of medium in y direction
        let apparent_y = -this.dy + wind[1] + -v_from_rotation_y;
        return [apparent_x, apparent_y];
    }


    calculate_wind_force(){
        // calculate the force on the sail exerted by the wind and the moment caused by that force
        let wind = this.wind_getter();
        let wind_x = wind[0] * Math.sin(toRadians(wind[1]));
        let wind_y = wind[0] * Math.cos(toRadians(wind[1]));
        let boom_length = (this.boat_points.clew[1] - this.boat_points.mast[1]);
        return this.calculate_lift(air_density, wind_x, wind_y, this.sail_area, this.sail_edge_area, ((this.bearing + this.sail_angle)% 360 +360)%360, this.boat_points.mast[1], boom_length*0.7, this.sail_drag_coefficient);
    }


    calculate_water_resistance(){
        // calculate force on keel exerted by water and moment caused by that force
        let rudder_length = (this.boat_points.stern[1] - this.boat_points.rudder_tip[1]);
        let result_keel = this.calculate_lift(water_density, 0, 0, this.keel_area, this.keel_edge_area, this.bearing, this.boat_points.keel[1], 0, this.keel_drag_coefficient);
        let result_rudder = this.calculate_lift(water_density, 0, 0, this.rudder_area, this.keel_edge_area, this.bearing + this.rudder_angle, this.boat_points.stern[1], rudder_length/2, this.keel_drag_coefficient);
        return result_keel.map((num, i) => num + result_rudder[i]);
    }


    calculate_lift(medium_density, medium_dx, medium_dy, wing_area, wing_area_leading, wing_bearing, wing_rotation_distance, wing_center_distance, wing_drag_parallel){
        /** calculates forces and moments due to a given wing in a given medium
         * @param {number} medium_density the density of the medium the wing is in (kg m^-3)
         * @param {number} medium_dx the speed in m s^-1 of the medium in the x direction
         * @param {number} medium_dy the speed in m s^-1 of the medium in the y direction
         * @param {number}wing_area the area in m^2 of the wing's 'flat' area
         * @param {number}wing_area_leading the area in m^2 of the wing leading edge
         * @param {number}wing_bearing the direction the front of the wing is pointing, in degrees from north
         * @param {number}wing_rotation_distance the distance from the center of the boat to the point the wing rotates around, in meters
         * @param {number}wing_center_distance the distance in meters between the point the wing rotates around and the point on the wing where the force acts
         * @param {number}wing_drag_parallel the drag coefficient of the sail parallel to the direction of the sail
         * @returns {number[3]} An array of three numbers: [The force in the x direction(N), the force in the y direction(N), the moment clockwise(Nm)]
         **/


        // x of point force acts through relative to boat center of rotation if boat is pointing north
        let x = Math.sin(toRadians(wing_bearing-this.bearing))*wing_center_distance;
        // y of point force acts through relative to boat center of rotation if boat is pointing north
        let y = wing_rotation_distance + Math.cos(toRadians(wing_bearing - this.bearing))*wing_center_distance;
        // distance from center of rotation of point force acts through
        let radius = Math.sqrt(Math.pow(x, 2) + Math.pow(y ,2));
        // location of point relative to boat with boat at actual bearing
        let point = rotate([x, y], this.bearing);

        // velocity perpendicular to wing from boat rotation
        let v_from_rotation = this.v_rot * radius;
        let v_from_rotation_x = v_from_rotation*Math.cos(Math.atan2(point[0], point[1]));
        let v_from_rotation_y = v_from_rotation*-Math.sin(Math.atan2(point[0], point[1]));

        // apparent velocity of medium in x direction
        let apparent_x = -this.dx + medium_dx + -v_from_rotation_x;
        // apparent velocity of medium in y direction
        let apparent_y = -this.dy + medium_dy + -v_from_rotation_y;
        let apparent_magnitude = Math.sqrt(Math.pow(apparent_x, 2) + Math.pow(apparent_y, 2));
        let apparent_bearing = toDegrees(Math.atan2(apparent_x, apparent_y));
        let relative_bearing = apparent_bearing - wing_bearing;

        // apparent medium velocity parallel to wing
        let apparent_parallel = Math.cos(toRadians(relative_bearing))*apparent_magnitude;
        // apparent medium flow perpendicular to wing
        let apparent_perpendicular = Math.sin(toRadians(relative_bearing))*apparent_magnitude;

        // parallel drag force
        // drag along wing, using F_d = 0.5 * medium density * flow velocity ^ 2 * drag coefficient * reference area
        let drag_parallel = Math.sign(apparent_parallel) * 0.5 * medium_density * Math.pow(apparent_parallel, 2) * wing_drag_parallel * wing_area_leading;
        // perpendicular drag force, F = m(v - u)/t. Or, F =  mass per second * (v-u)
        // change in velocity(v - u) of medium perpendicular to wing, assume wing stops flow entirely
        let delta_v_perpendicular = 0 - apparent_perpendicular;
        // mass of medium hitting wing per second = (volume per second) * (mass per volume) = (flow rate * surface area) * (medium density)
        let mass_per_second = Math.abs(apparent_perpendicular) * wing_area * medium_density;
        // force of wing on medium
        let force_perpendicular = mass_per_second * delta_v_perpendicular;
        // invert to get force of medium on wing
        force_perpendicular = -force_perpendicular;

        // resultant translational force in x direction
        let resultant_x = drag_parallel*Math.sin(toRadians(wing_bearing)) + force_perpendicular*Math.cos(toRadians(wing_bearing));
        // resultant translational force in y direction
        let resultant_y = drag_parallel*Math.cos(toRadians(wing_bearing)) - force_perpendicular*Math.sin(toRadians(wing_bearing));


        // moment calculation
        // moment = force * perpendicular distance
        // the perpendicular distance of force parallel with wing
        let distance_parallel = Math.sin(toRadians(wing_bearing - this.bearing))*wing_rotation_distance;
        // moment from parallel force
        let moment_parallel = drag_parallel * distance_parallel;

        // the perpendicular distance of force perpendicular to the wing
        let distance_perpendicular = wing_center_distance + wing_rotation_distance * Math.cos(toRadians(wing_bearing - this.bearing));
        // moment from perpendicular force
        let moment_perpendicular = force_perpendicular * distance_perpendicular;

        let resultant_moment = moment_parallel + moment_perpendicular;

        return [resultant_x, resultant_y, resultant_moment];
    }

    clear_debug(){
        // resets debug text
        this.debug_text = "";
    }
}


class Environment{
    /**
     * environment for adding boats to. Consists of an area with wind blowing. Deals with displaying itself
     * @param wind_direction bearing of the wind
     * @param wind_speed speed of wind in that direction
     * @param canvas an HTML canvas to display on
     */
    constructor(wind_direction, wind_speed, canvas){
        this.wind_direction = wind_direction;
        this.wind_speed = wind_speed;
        this.canvas = canvas;
        this.boats = [];
        this.previous_time = 0;
        this.delta_time = 0;
        this.animation_toggle = false;
    }

    start_environment(){
        // start animating the environment
        this.animation_toggle = true;
        this.previous_time = performance.now();
        this.render();
        window.requestAnimationFrame(this.draw.bind(this));
    }

    stop_environment(){
        // stop animating the environment
        this.animation_toggle = false;
        window.cancelAnimationFrame(this.draw);
    }

    toggle(){
        // toggle environment animation
        if(this.animation_toggle){
            this.stop_environment();
        }else{
            this.start_environment();
        }

    }

    add_boat(boat){
        /** adds the given boat to the environment
          * @param {Boat} boat a boat object
         **/
        boat.wind_getter = this.get_wind.bind(this);
        this.boats.push(boat);
    }

    get_wind(){
        /**
         * @returns {Number[2]} wind speed in m s^-1 and wid direction as a bearing in degrees
         */
        return [this.wind_speed, this.wind_direction];
    }


    render() {
        // adjust canvas and contents based on window size
        // set canvas proportions to match screen
        this.canvas.canvas.width = document.documentElement.clientWidth;
        this.canvas.canvas.height = document.documentElement.clientHeight;
        let width_change = this.canvas.canvas.width /this.canvas.width;
        let height_change = this.canvas.canvas.height/this.canvas.height;
        this.canvas.width = this.canvas.canvas.width;
        this.canvas.height = this.canvas.canvas.height;
        this.boats.forEach(
            // adjust boat positions on resize to keep all in frame
            function (node){
                node.x *= width_change;
                node.y *= height_change;
            });

    }


    draw(current_time){
        /** draws a new frame of animation
         * @param {number} current_time the current unix timestamp
         */
        let ctx = this.canvas.context;
        // clear canvas ready for new frame
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // get time elapsed since last frame
        this.delta_time = current_time - this.previous_time;
        this.previous_time = current_time;



        //iterate through every boat
        for(let n = 0;n<this.boats.length;n++) {
            let boat = this.boats[n];
            boat.update(this.delta_time, this.wind_direction, this.wind_speed);
            boat.x = ((boat.x % (this.canvas.width/ppm)) + (this.canvas.width/ppm))%(this.canvas.width/ppm);
            boat.y = ((boat.y % (this.canvas.height/ppm)) + (this.canvas.height/ppm))%(this.canvas.height/ppm);

            // points on the boat when pointing in default direction
            let points = structuredClone(boat.boat_points);

            // rotate sail
            let clew = points.clew;
            let mast = points.mast;
            // recenter clew so origin is equivalent to mast location
            clew = [clew[0]-mast[0], clew[1]-mast[1]];
            // rotate sail
            clew = rotate(clew, boat.sail_angle);
            // revert to correct centering
            clew = [clew[0]+mast[0], clew[1]+mast[1]];

            points.clew = clew;

            // rotate tiller and rudder
            let tiller = points.tiller_tip;
            let rudder = points.rudder_tip;
            let stern = points.stern;
            // recenter around stern
            tiller = [tiller[0]-stern[0], tiller[1]-stern[1]];
            rudder = [rudder[0]-stern[0], rudder[1]-stern[1]];
            // rotate tiller
            tiller = rotate(tiller, boat.rudder_angle);
            // rotate rudder
            rudder = rotate(rudder, boat.rudder_angle);
            // revert centering
            tiller = [tiller[0]+stern[0], tiller[1]+stern[1]];
            rudder = [rudder[0]+stern[0], rudder[1]+stern[1]];

            points.tiller_tip = tiller;
            points.rudder_tip = rudder;
            // rotate whole boat to bearing and move to correct position
            for(let key of Object.keys(points)){
                let point = points[key];
                //rotate the given point to align with bearing
                point = rotate(point, boat.bearing);

                // add position coordinates to move boat to correct position
                let point_in_space = [point[0] + boat.x, point[1]+boat.y];

                // convert to canvas location
                points[key] = [point_in_space[0]*ppm, (this.canvas.height/ppm - point_in_space[1])*ppm];
            }
            // set boat colour
            ctx.strokeStyle = gunwale_colour;
            ctx.fillStyle = boat_colour;
            // draw the boat
            ctx.beginPath();
            ctx.moveTo(points.bow[0], points.bow[1]);
            ctx.quadraticCurveTo(points.port_stern[0], points.port_stern[1], points.stern[0], points.stern[1]);
            ctx.quadraticCurveTo(points.starboard_stern[0], points.starboard_stern[1], points.bow[0], points.bow[1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // set tiller colour
            ctx.strokeStyle = tiller_colour;
            ctx.fillStyle = tiller_colour;
            ctx.beginPath();
            ctx.moveTo(points.tiller_tip[0], points.tiller_tip[1]);
            ctx.lineTo(points.rudder_tip[0], points.rudder_tip[1]);
            ctx.closePath();
            ctx.stroke();
            // set sail colour
            ctx.strokeStyle = sail_colour;
            ctx.fillStyle = sail_colour;
            ctx.beginPath();
            ctx.moveTo(points.mast[0], points.mast[1]);
            ctx.lineTo(points.clew[0], points.clew[1]);
            ctx.closePath();
            ctx.stroke();

            // boat stats
            ctx.fillStyle = "#000000";
            ctx.font = "25px Courier New";
            let sog = Math.sqrt(Math.pow(boat.dx, 2) + Math.pow(boat.dy, 2)).toFixed(3);
            let cog = (toDegrees(Math.atan2(boat.dx, boat.dy))%360 + 360)%360;
            let stats = `SOG: ${sog}m/s  Bearing: ${boat.bearing.toPrecision(3)}°  COG: ${cog.toFixed(1)}°`;

            ctx.fillText(stats, 0, this.canvas.height - 25);

            // debug text
            ctx.font = "10px Courier New";
            let text = boat.debug_text.split("\n");
            let above = 0
            for(let line of text.keys()){
                ctx.fillText(text[line], 0, above + 400);
                above += 10;
            }
            boat.clear_debug();
        }

        // wind indicator
        let points = structuredClone(arrow_points);
        for(let key of Object.keys(points)){
            //rotate the given point to align with wind direction and align with top left corner
            points[key] = rotate(points[key], this.wind_direction);
            points[key] = [points[key][0] + arrow_length, (arrow_length - points[key][1])];
        }

        // draw direction indicator
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#000000";
        ctx.moveTo(points.tail[0], points.tail[1]);
        ctx.beginPath();
        ctx.lineTo(points.left[0], points.left[1]);
        ctx.lineTo(points.tip[0], points.tip[1]);
        ctx.lineTo(points.right[0], points.right[1]);
        ctx.lineTo(points.tail[0], points.tail[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // draw speed readout
        ctx.font = "50px Courier New";
        ctx.fillText(`${this.wind_speed}m/s`, 0.2*arrow_length, 2.3*arrow_length);



        // continue animating unless told otherwise
        if(this.animation_toggle){
            window.requestAnimationFrame(this.draw.bind(this));
        }
    }
}


class Canvas{
    // object used to keep track of animation canvas
    #height;
    #width;
    #context;
    constructor(id){
        this.canvas = document.getElementById(id);
        this.#context = this.canvas.getContext("2d");
        this.canvas.width = document.documentElement.clientWidth;
        this.canvas.height = document.documentElement.clientHeight;
        this.height = this.canvas.height;
        this.width = this.canvas.width;
    }


    set width(value) {
        this.#width = value;
    }

    set height(value) {
        this.#height = value;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    get context() {
        return this.#context;
    }
}

function rotate(x, b){
    /** rotates point x around the origin by b degrees
     * @param {Number[2]}x a point with an x and y coordinate
     * @param {Number}b a number of degrees clockwise to rotate x by
     * @returns {Number[2]} a point [x, y]
     */
    return [(x[0]*Math.cos(toRadians(b)) + x[1]*Math.sin(toRadians(b))),
        (x[1]*Math.cos(toRadians(b)) - x[0]*Math.sin(toRadians(b)))];
}


function toRadians(degrees){
    // convert degrees to radians
    return degrees*Math.PI/180;
}


function toDegrees(radians){
    // convert radians to degrees
    return radians*180/Math.PI;
}